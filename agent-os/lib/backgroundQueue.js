import { AGENTS, OLLAMA_URL } from './agents.js';
import { addToMemory, saveToWorkspace } from './memory.js';
import { addLesson, saveLastTask, triggerAutoRefine } from './learning.js';
import { getProcesses, registerProcess, completeProcess } from './processes.js';
import { claimBackgroundJob, completeBackgroundJob, enqueueBackgroundJob, failBackgroundJob } from './durableStore.js';
import { stripThinkBlocks } from './router.js';

const WORKER_ID = 'agent-os-background-worker';
const DEFAULT_QUEUE = 'background';

function getState() {
  const globalKey = '__agentOsBackgroundWorker';
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = {
      started: false,
      busy: false,
      timer: null,
    };
  }
  return globalThis[globalKey];
}

function hasActiveForegroundWork() {
  const running = getProcesses().filter((process) => process.status === 'running');
  return running.some((process) => process.type === 'pipeline' || String(process.id || '').startsWith('autojob-'));
}

function buildReflectionPrompt({ agentName, stepLabel, topic, output }) {
  return `You are ${agentName}. Pipeline step "${stepLabel}" for: "${String(topic || '').slice(0, 120)}"
Output: ${String(output || '').split(' ').length} words.

Reflect. JSON only:
{"score":7,"what_worked":"one sentence","what_failed":"one sentence","improvement":"one specific thing","is_win":false}`;
}

function buildLeadGenPrompt(topic) {
  return `You are Luna, OTG Icon's lead qualifier. A pipeline just completed on: "${topic}"

Based on this topic, generate 3-5 detailed potential client leads who would buy THIS specific service.

For EACH lead provide:
1. Business Name
2. Why They Need This
3. Service Match
4. Budget Range
5. Temperature
6. Personalized Pitch
7. Objection & Counter

End with [QUALIFIED] and JSON: {"leads_found":0,"hot_leads":0,"pipeline_topic":"${String(topic || '').slice(0, 100)}"}`;
}

async function runReflectionJob(job) {
  const payload = job.payload || {};
  const processId = `queue-${job.id}`;
  registerProcess(processId, 'agent', 'Queue: pipeline reflection', {
    queueJobId: job.id,
    jobType: job.job_type,
    relatedRunId: job.related_run_id,
  });

  const agentId = String(payload.agentId || '');
  const agent = AGENTS[agentId];
  if (!agent) throw new Error(`Unknown agent for reflection job: ${agentId || 'missing'}`);

  const reflectAbort = new AbortController();
  const reflectTimeout = setTimeout(() => reflectAbort.abort(), 60000);
  try {
    const response = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      signal: reflectAbort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:14b',
        messages: [
          {
            role: 'user',
            content: buildReflectionPrompt({
              agentName: payload.agentName || agent.name,
              stepLabel: payload.stepLabel || 'Pipeline step',
              topic: payload.topic || '',
              output: payload.output || '',
            }),
          },
        ],
        stream: false,
        options: { temperature: 0.3, num_ctx: 2048, num_predict: 200 },
      }),
    });

    if (!response.ok) throw new Error(`Reflection model error: ${response.status}`);

    const data = await response.json();
    const content = String(data.message?.content || '{}')
      .replace(/^```json\n?/i, '')
      .replace(/^```\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim();
    const reflection = JSON.parse(content || '{}');

    addLesson(agentId, {
      task: String(payload.topic || '').slice(0, 200),
      workflowType: payload.workflowType || 'pipeline',
      score: Math.max(1, Math.min(10, parseInt(reflection.score, 10) || 7)),
      what_worked: reflection.what_worked || '',
      what_failed: reflection.what_failed || '',
      improvement: reflection.improvement || '',
    });
    await triggerAutoRefine(agentId);
    saveLastTask(agentId, `${payload.topic || 'Pipeline'} — ${payload.stepLabel || 'Reflection'}`, payload.output || '', {
      workflowType: payload.workflowType || 'pipeline-reflection',
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveToWorkspace(agentId, `background-reflections/${timestamp}-${job.id}.md`, [
      `# Reflection for ${payload.stepLabel || 'Pipeline Step'}`,
      `Topic: ${payload.topic || ''}`,
      `Agent: ${payload.agentName || agent.name}`,
      `Job: ${job.id}`,
      '',
      '---',
      '',
      payload.output || '',
      '',
      '---',
      '',
      content,
    ].join('\n'));

    completeProcess(processId, 'complete');
    return { success: true };
  } catch (error) {
    completeProcess(processId, 'failed');
    throw error;
  } finally {
    clearTimeout(reflectTimeout);
  }
}

async function runLeadGenJob(job) {
  const payload = job.payload || {};
  const processId = `queue-${job.id}`;
  registerProcess(processId, 'agent', 'Queue: lead generation', {
    queueJobId: job.id,
    jobType: job.job_type,
    relatedRunId: job.related_run_id,
  });

  const leadPrompt = buildLeadGenPrompt(payload.topic || '');
  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5-ctx32k',
      messages: [
        { role: 'system', content: AGENTS.luna.systemPrompt },
        { role: 'user', content: leadPrompt },
      ],
      stream: false,
      options: { temperature: 0.7, num_ctx: 16384 },
    }),
  });

  if (!response.ok) throw new Error(`Lead gen model error: ${response.status}`);

  const data = await response.json();
  const output = stripThinkBlocks(String(data.message?.content || '')).trim();
  if (!output) throw new Error('Lead generation returned no content');

  addToMemory('luna', 'user', '[AUTO] Lead gen for pipeline: ' + (payload.topic || ''));
  addToMemory('luna', 'assistant', output);
  saveLastTask('luna', '[AUTO] Lead gen for pipeline: ' + (payload.topic || ''), output, { workflowType: 'pipeline-leads' });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  saveToWorkspace('luna', `background-leads/${timestamp}-${job.id}.md`, [
    '# Auto Lead Generation',
    `Pipeline Topic: ${payload.topic || ''}`,
    `Job: ${job.id}`,
    `Date: ${new Date().toISOString()}`,
    '',
    '---',
    '',
    output,
  ].join('\n'));

  completeProcess(processId, 'complete');
  return { success: true };
}

async function drainQueueOnce() {
  if (hasActiveForegroundWork()) return;

  while (true) {
    if (hasActiveForegroundWork()) return;
    const job = claimBackgroundJob(WORKER_ID, DEFAULT_QUEUE);
    if (!job) return;

    try {
      if (job.job_type === 'pipeline_reflection') {
        await runReflectionJob(job);
      } else if (job.job_type === 'pipeline_leadgen') {
        await runLeadGenJob(job);
      } else {
        throw new Error(`No handler registered for background job type "${job.job_type}"`);
      }
      completeBackgroundJob(job.id, { handledBy: WORKER_ID, handledAt: new Date().toISOString() });
    } catch (error) {
      failBackgroundJob(job.id, error, { handledBy: WORKER_ID });
    }
  }
}

export function startBackgroundJobWorker() {
  const state = getState();
  if (state.started) return;
  state.started = true;

  const tick = async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      await drainQueueOnce();
    } finally {
      state.busy = false;
    }
  };

  void tick();
  state.timer = setInterval(() => {
    void tick();
  }, 5000);
  if (typeof state.timer.unref === 'function') {
    state.timer.unref();
  }
}

export function queuePipelineReflectionJob(input = {}) {
  return enqueueBackgroundJob('pipeline_reflection', input, {
    queueName: DEFAULT_QUEUE,
    relatedRunId: input.runId || input.processId || '',
    availableAt: input.availableAt || new Date(Date.now() + Number(input.delayMs || 8000)).toISOString(),
  });
}

export function queuePipelineLeadGenJob(input = {}) {
  return enqueueBackgroundJob('pipeline_leadgen', input, {
    queueName: DEFAULT_QUEUE,
    relatedRunId: input.runId || input.processId || '',
    availableAt: input.availableAt || new Date(Date.now() + Number(input.delayMs || 10000)).toISOString(),
  });
}
