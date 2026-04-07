import { AGENTS, OLLAMA_URL, MODEL_TIMEOUTS, DEFAULT_TIMEOUT } from '../../../lib/agents.js';
import { buildPipelinePrompt, extractHandoffJson, extractNarrativeSummary, stripThinkBlocks } from '../../../lib/router.js';
import { logHandoff, updateHandoffUsage, completeSession } from '../../../lib/comms.js';
import { addToMemory } from '../../../lib/memory.js';
import { addLesson, getLessonsPrompt, saveLastTask, triggerAutoRefine } from '../../../lib/learning.js';
import { buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';
import { buildCanonicalDataModelContext } from '../../../lib/canonicalDataModel.js';
import { buildContentOSContext } from '../../../lib/contentOS.js';
import { registerProcess, completeProcess } from '../../../lib/processes.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getAgentModel(agentId) {
  const models = {
    alex: 'deepseek-r1-ctx32k',
    maya: 'qwen2.5-ctx32k',
    jordan: 'deepseek-r1-ctx32k',
    sam: 'qwen2.5:14b',
    dev: 'qwen2.5-ctx32k',
    luna: 'qwen2.5-ctx32k',
    rex: 'qwen2.5-ctx32k',
    nova: 'qwen2.5-ctx32k',
    iris: 'qwen2.5-ctx32k',
    pixel: 'qwen2.5-ctx32k',
    ceo: 'qwen2.5-ctx32k',
    cto: 'qwen2.5-ctx32k',
  };
  return models[agentId] || 'qwen2.5-ctx32k';
}

async function runAgent(agentId, prompt, model) {
  const agent = AGENTS[agentId];
  const timeout = MODEL_TIMEOUTS[model] || DEFAULT_TIMEOUT;
  const abortCtrl = new AbortController();
  const timer = setTimeout(() => abortCtrl.abort('timeout'), timeout);

  try {
    const res = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      signal: abortCtrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: [buildArchitectureTargetContext(agentId), buildCanonicalDataModelContext(), buildContentOSContext(prompt, agentId), agent.systemPrompt, getLessonsPrompt(agentId)].filter(Boolean).join('\n\n') },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.7, num_ctx: 32768 },
      }),
    });

    if (!res.ok) throw new Error('Ollama error: ' + res.status);
    const data = await res.json();
    return stripThinkBlocks(data.message?.content || '');
  } finally {
    clearTimeout(timer);
  }
}

function queueReflection(agentId, task, output, label, workflowType = 'n8n') {
  if (output.split(' ').length <= 30) return;

  const agentName = AGENTS[agentId]?.name || agentId;
  fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:14b',
      messages: [{
        role: 'user',
        content: `You are ${agentName}. ${label}: "${task.substring(0, 120)}"
Output: ${output.split(' ').length} words.

Reflect. JSON only:
{"score":7,"what_worked":"one sentence","what_failed":"one sentence","improvement":"one specific thing"}`,
      }],
      stream: false,
      options: { temperature: 0.3, num_ctx: 2048, num_predict: 200 },
    }),
  }).then(async (response) => {
    if (!response.ok) return;
    const data = await response.json();
    const content = (data.message?.content || '{}')
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();

    try {
      const reflection = JSON.parse(content);
      addLesson(agentId, {
        task: task.substring(0, 200),
        workflowType,
        score: Math.max(1, Math.min(10, parseInt(reflection.score) || 7)),
        what_worked: reflection.what_worked || '',
        what_failed: reflection.what_failed || '',
        improvement: reflection.improvement || '',
      });
      await triggerAutoRefine(agentId);
    } catch {}
  }).catch(() => {});
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'qualify-lead': {
        const { lead } = body;
        if (!lead) return Response.json({ error: 'Missing lead object' }, { status: 400 });

        const topic = buildLeadTopic(lead);
        const model = getAgentModel('luna');
        const prompt = buildPipelinePrompt('luna', topic, '', []);
        const output = await runAgent('luna', prompt, model);
        const qualification = extractHandoffJson('luna', output);

        addToMemory('luna', 'user', prompt);
        addToMemory('luna', 'assistant', output);
        try { saveLastTask('luna', topic, output, { workflowType: 'n8n' }); } catch {}
        queueReflection('luna', topic, output, 'n8n qualify-lead', 'n8n');

        const score = qualification?.score || 0;
        const temperature = score >= 8 ? 'hot' : score >= 5 ? 'warm' : 'cold';
        const tags = ['agent-os', 'ai-qualified', temperature + '-lead'];
        if (qualification?.service_needed) {
          tags.push(qualification.service_needed.toLowerCase().replace(/\s+/g, '-'));
        }

        return Response.json({
          success: true,
          action: 'qualify-lead',
          lead,
          qualification,
          fullOutput: output,
          score,
          temperature,
          tags,
          recommendedPackage: qualification?.recommended_package || null,
          nextStep: qualification?.next_step || null,
        });
      }

      case 'sales-pipeline': {
        const { lead } = body;
        if (!lead) return Response.json({ error: 'Missing lead object' }, { status: 400 });

        const topic = buildLeadTopic(lead);
        const sessionId = 'n8n-sales-' + Date.now();
        const processId = sessionId;
        registerProcess(processId, 'pipeline', 'n8n Sales: ' + (lead.name || topic).substring(0, 60));

        const steps = [
          { agentId: 'luna', label: 'Lead Qualification' },
          { agentId: 'rex', label: 'Proposal Writing' },
          { agentId: 'nova', label: 'Client Success Plan' },
        ];

        const completedSteps = [];
        const results = {};

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const model = getAgentModel(step.agentId);
          const prompt = buildPipelinePrompt(step.agentId, topic, '', completedSteps);

          let output;
          try {
            output = await runAgent(step.agentId, prompt, model);
          } catch (err) {
            completeProcess(processId, 'failed');
            completeSession(sessionId, 'failed');
            return Response.json({
              success: false,
              error: step.agentId + ' failed: ' + err.message,
              completedSteps: i,
              results,
            }, { status: 500 });
          }

          results[step.agentId] = output;
          const handoffJson = extractHandoffJson(step.agentId, output);
          const narrativeSummary = extractNarrativeSummary(step.agentId, output, 200);

          completedSteps.push({
            agentId: step.agentId,
            agentName: AGENTS[step.agentId].name,
            role: step.label,
            output,
            handoffJson,
            narrativeSummary,
          });

          if (i < steps.length - 1) {
            logHandoff(
              sessionId,
              step.agentId,
              steps[i + 1].agentId,
              output.split('\n').slice(0, 3).join(' '),
              output,
              topic
            );
          }
          if (i > 0) {
            updateHandoffUsage(sessionId, steps[i - 1].agentId, output);
          }

          addToMemory(step.agentId, 'user', prompt);
          addToMemory(step.agentId, 'assistant', output);
          try { saveLastTask(step.agentId, topic + ' - ' + step.label, output, { workflowType: 'n8n' }); } catch {}
          queueReflection(step.agentId, topic, output, step.label, 'n8n');
        }

        completeProcess(processId, 'complete');
        completeSession(sessionId, 'complete');

        const qualification = completedSteps[0]?.handoffJson || {};
        const score = qualification?.score || 0;
        const temperature = score >= 8 ? 'hot' : score >= 5 ? 'warm' : 'cold';

        return Response.json({
          success: true,
          action: 'sales-pipeline',
          sessionId,
          lead,
          score,
          temperature,
          tags: [
            'agent-os',
            'ai-qualified',
            temperature + '-lead',
            qualification?.service_needed?.toLowerCase().replace(/\s+/g, '-') || 'general',
          ].filter(Boolean),
          qualification,
          proposal: results.rex || '',
          clientPlan: results.nova || '',
          fullOutputs: {
            luna: results.luna || '',
            rex: results.rex || '',
            nova: results.nova || '',
          },
          recommendedPackage: qualification?.recommended_package || null,
          nextStep: qualification?.next_step || null,
          budgetRange: qualification?.budget_range || null,
          serviceNeeded: qualification?.service_needed || null,
          timeline: qualification?.timeline || null,
        });
      }

      case 'single-agent': {
        const { agentId, message } = body;
        if (!agentId || !message) return Response.json({ error: 'Missing agentId or message' }, { status: 400 });
        if (!AGENTS[agentId]) return Response.json({ error: 'Unknown agent: ' + agentId }, { status: 400 });

        const model = body.model || getAgentModel(agentId);
        const output = await runAgent(agentId, message, model);
        const handoffJson = extractHandoffJson(agentId, output);

        addToMemory(agentId, 'user', message);
        addToMemory(agentId, 'assistant', output);
        try { saveLastTask(agentId, message, output, { workflowType: 'n8n' }); } catch {}
        queueReflection(agentId, message, output, 'n8n single-agent', 'n8n');

        return Response.json({
          success: true,
          action: 'single-agent',
          agentId,
          agentName: AGENTS[agentId].name,
          output,
          structuredData: handoffJson,
        });
      }

      default:
        return Response.json({
          error: 'Unknown action: ' + action,
          available: ['qualify-lead', 'sales-pipeline', 'single-agent'],
        }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({
    name: 'OTG Agent OS - n8n Webhook',
    version: '1.0',
    actions: {
      'qualify-lead': {
        description: 'Run Luna to qualify an incoming lead',
        method: 'POST',
        body: {
          action: 'qualify-lead',
          lead: { name: '', email: '', phone: '', service: '', message: '', source: '' },
        },
        returns: 'qualification JSON with score 1-10, temperature (hot/warm/cold), tags, recommended package',
      },
      'sales-pipeline': {
        description: 'Full sales pipeline: Luna (qualify) -> Rex (proposal) -> Nova (client plan)',
        method: 'POST',
        body: {
          action: 'sales-pipeline',
          lead: { name: '', email: '', phone: '', service: '', message: '', source: '' },
        },
        returns: 'qualification + proposal + client plan + GHL-ready tags and fields',
      },
      'single-agent': {
        description: 'Run any agent with a custom prompt',
        method: 'POST',
        body: { action: 'single-agent', agentId: 'alex|maya|jordan|dev|sam|luna|rex|nova|iris|pixel|ceo|cto', message: '' },
        returns: 'agent output + structured data if completion marker present',
      },
    },
    agents: Object.entries(AGENTS).map(([id, agent]) => ({ id, name: agent.name, role: agent.role })),
  });
}

function buildLeadTopic(lead) {
  const parts = [];
  if (lead.name) parts.push('Lead: ' + lead.name);
  if (lead.service) parts.push('Service: ' + lead.service);
  if (lead.message) parts.push('Message: ' + lead.message);
  if (lead.source) parts.push('Source: ' + lead.source);
  if (lead.email) parts.push('Email: ' + lead.email);
  if (lead.phone) parts.push('Phone: ' + lead.phone);
  if (lead.budget) parts.push('Budget: ' + lead.budget);
  if (lead.timeline) parts.push('Timeline: ' + lead.timeline);
  if (lead.location) parts.push('Location: ' + lead.location);
  return parts.join(' | ') || 'New lead inquiry';
}
