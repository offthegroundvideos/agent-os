import { AGENTS, OLLAMA_URL, DEFAULT_MODEL, MODEL_TIMEOUTS, DEFAULT_TIMEOUT } from '../../../lib/agents.js';
import { stripThinkBlocks } from '../../../lib/router.js';
import { getConversationHistory, addToMemory, saveToWorkspace } from '../../../lib/memory.js';
import { registerProcess, completeProcess, isProcessStopped } from '../../../lib/processes.js';
import { logAccomplishment } from '../../../lib/chapters.js';
import { getLessonsPrompt, saveLastTask, addLesson, triggerAutoRefine } from '../../../lib/learning.js';
import { buildGrowthOSContext } from '../../../lib/growthOS.js';
import { buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';
import { buildCanonicalDataModelContext } from '../../../lib/canonicalDataModel.js';
import { buildContentOSContext } from '../../../lib/contentOS.js';
import { getResearchContextForTopic, getViralSystemAddendum } from '../../../lib/viralResearch.js';
import { dispatchDeerFlowTask, shouldAutoDispatchToDeerFlow } from '../../../lib/deerflowBridge.js';
import { getRoutingDecision } from '../../../lib/routingPolicy.js';

const CHAT_DEFAULT_MODEL = 'qwen2.5:14b';
const FAST_CHAT_FIRST_TOKEN_TIMEOUT = 12000;
const STANDARD_CHAT_FIRST_TOKEN_TIMEOUT = 25000;
const STREAM_IDLE_TIMEOUT = 20000;

function inferChatMode(agentId, message = '', selectedModel = CHAT_DEFAULT_MODEL) {
  const lower = String(message || '').toLowerCase().trim();
  const heavyTerms = [
    'research', 'analyze', 'compare', 'deep', 'full plan', 'full strategy', 'roadmap',
    'architecture', 'audit', 'proposal', 'funnel', '30/60/90', 'business review',
    'technical command', 'system health', 'platform split', 'competitor', 'viral',
  ];
  const isHeavy = heavyTerms.some((term) => lower.includes(term));
  const shortEnough = lower.length <= 220 && !lower.includes('\n');
  const fastModel = selectedModel === 'qwen2.5:14b';
  const preferStandardAgents = ['alex', 'jordan', 'rex', 'ceo', 'cto'].includes(agentId) && isHeavy;
  return fastModel && shortEnough && !isHeavy && !preferStandardAgents ? 'fast' : 'standard';
}

function getChatOptions(selectedModel, chatMode) {
  const fastModel = selectedModel === 'qwen2.5:14b';
  if (chatMode === 'fast') {
    return {
      temperature: 0.55,
      num_ctx: fastModel ? 4096 : 8192,
      num_predict: 180,
    };
  }
  return {
    temperature: 0.7,
    num_ctx: fastModel ? 8192 : 16384,
    num_predict: 420,
  };
}

function shouldIncludeResearchContext(agentId, message = '') {
  const lower = String(message || '').toLowerCase();
  if (agentId === 'alex') return true;
  return ['research', 'viral', 'trend', 'niche', 'competitor', 'hook', 'platform'].some((term) => lower.includes(term));
}

function buildAgentContext(agentId, message = '', agent, lessonsPrompt = '', chatMode = 'standard') {
  const sections = [agent.systemPrompt];
  const lower = String(message || '').toLowerCase();
  const isContentFlowAgent = ['alex', 'maya', 'jordan', 'sam', 'iris', 'pixel'].includes(agentId);
  const isTechnicalAgent = ['dev', 'cto'].includes(agentId);
  const isFunnelAgent = ['jordan', 'luna', 'rex', 'nova', 'ceo'].includes(agentId);
  const needsArchitectureContext = agentId === 'cto' || ['architecture', 'infra', 'system', 'deploy', 'performance', 'security', 'audit', 'docker', 'stack'].some((term) => lower.includes(term));
  const needsCanonicalDataContext = ['ghl', 'crm', 'client', 'lead', 'opportunity', 'funnel', 'publish', 'calendar', 'asset', 'schema', 'data model'].some((term) => lower.includes(term));

  if (isContentFlowAgent) {
    sections.unshift(buildGrowthOSContext());
    sections.push(getViralSystemAddendum(agentId));
  }

  if (isTechnicalAgent && needsArchitectureContext) {
    sections.unshift(buildArchitectureTargetContext(agentId));
  }

  if ((isTechnicalAgent && needsCanonicalDataContext) || (isFunnelAgent && ['offer', 'lead', 'funnel', 'proposal', 'client', 'crm', 'page'].some((term) => lower.includes(term)))) {
    sections.unshift(buildCanonicalDataModelContext());
  }

  if (['alex', 'maya', 'jordan', 'sam', 'pixel', 'ceo'].includes(agentId)) {
    sections.push(buildContentOSContext(message, agentId));
  }

  if (chatMode !== 'fast' && shouldIncludeResearchContext(agentId, message)) {
    const researchContext = getResearchContextForTopic(message);
    if (researchContext) sections.push(researchContext);
  }

  if (chatMode !== 'fast' && lessonsPrompt) sections.push(lessonsPrompt);

  return sections.filter(Boolean).join('\n\n');
}

async function runOllamaChatStream({ selectedModel, messages, options, controller, firstTokenTimeoutMs, onAbortReason }) {
  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: JSON.stringify({
      model: selectedModel,
      messages,
      stream: true,
      options,
    }),
  });

  if (!response.ok) {
    throw new Error('Ollama error: ' + response.status);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Ollama stream unavailable');

  const decoder = new TextDecoder();
  let buffer = '';
  let reply = '';
  let sawFirstToken = false;
  let watchdog = null;

  const resetWatchdog = (ms) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      const reason = sawFirstToken ? 'stream idle timeout' : 'first token timeout';
      if (onAbortReason) onAbortReason(reason);
      controller.abort(reason);
    }, ms);
  };

  resetWatchdog(firstTokenTimeoutMs);

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        const chunk = parsed?.message?.content || '';
        if (chunk) {
          reply += chunk;
          if (!sawFirstToken) {
            sawFirstToken = true;
          }
          resetWatchdog(STREAM_IDLE_TIMEOUT);
        }
        if (parsed?.done) {
          if (watchdog) clearTimeout(watchdog);
          return stripThinkBlocks(reply || 'No response received');
        }
      }
    }
  } finally {
    if (watchdog) clearTimeout(watchdog);
  }

  return stripThinkBlocks(reply || 'No response received');
}

export async function POST(request) {
  let processId;
  let stopChecker;
  let requestedModel = DEFAULT_MODEL;
  let abortReason = '';

  try {
    const { agentId, message, model, autoReflect, processId: clientProcessId, chatModeOverride } = await request.json();
    if (!agentId || !message) {
      return Response.json({ error: 'Missing agentId or message' }, { status: 400 });
    }

    const agent = AGENTS[agentId];
    if (!agent) return Response.json({ error: 'Unknown agent: ' + agentId }, { status: 404 });

    const routingDecision = getRoutingDecision({ agentId, message, routeType: 'chat' });

    if (shouldAutoDispatchToDeerFlow(agentId, message)) {
      processId = clientProcessId || ('agent-' + agentId + '-' + Date.now());
      try { registerProcess(processId, 'agent', agent.name + ': ' + message.substring(0, 60) + (message.length > 60 ? '...' : '')); } catch {}
      try {
        const delegated = await dispatchDeerFlowTask({ agentId, message });
        const delegatedReply = [
          delegated.taskType === 'research'
            ? `DeerFlow dispatched this ${agent.name} deep research task.`
            : `DeerFlow coding teammate dispatched this ${agent.name} task to ${delegated.repoPath}.`,
          routingDecision?.reason ? `Routing policy: ${routingDecision.reason}` : '',
          delegated.reply,
          delegated.validation ? `Validation target: ${delegated.validation}` : '',
          delegated.taskType ? `Task type: ${delegated.taskType}` : '',
          delegated.job?.id ? `DeerFlow job: ${delegated.job.id}` : '',
        ].filter(Boolean).join('\n\n');
        addToMemory(agentId, 'user', message);
        addToMemory(agentId, 'assistant', delegatedReply);
        try { saveLastTask(agentId, message, delegatedReply, { workflowType: 'chat' }); } catch {}
        try { completeProcess(processId, 'complete'); } catch {}
        return Response.json({
          agentId,
          agentName: agent.name,
          reply: delegatedReply,
          model: 'deerflow-bridge',
          processId,
          delegated: true,
          deerflowJob: delegated.job,
        });
      } catch (bridgeError) {
        console.warn('DeerFlow dispatch failed, falling back to direct agent execution:', bridgeError.message);
      }
    }

    // Load conversation history
    const history = getConversationHistory(agentId);
    addToMemory(agentId, 'user', message);

    // Inject lessons into system prompt
    const lessonsPrompt = getLessonsPrompt(agentId);
    const selectedModel = model || CHAT_DEFAULT_MODEL;
    const chatMode = ['fast', 'standard'].includes(chatModeOverride)
      ? chatModeOverride
      : inferChatMode(agentId, message, selectedModel);
    const enhancedSystemPrompt = buildAgentContext(agentId, message, agent, lessonsPrompt, chatMode);

    const messages = [
      { role: 'system', content: enhancedSystemPrompt },
      ...history.slice(-(chatMode === 'fast' ? 4 : 8)),
      { role: 'user', content: message },
    ];

    processId = clientProcessId || ('agent-' + agentId + '-' + Date.now());
    try { registerProcess(processId, 'agent', agent.name + ': ' + message.substring(0, 60) + (message.length > 60 ? '...' : '')); } catch {}

    // AbortController handles both user stop and timeout
    const controller = new AbortController();

    // Stop checker — polls process status every 500ms
    stopChecker = setInterval(() => {
      try {
        if (isProcessStopped(processId)) {
          controller.abort('stopped by user');
          clearInterval(stopChecker);
        }
      } catch {}
    }, 500);

    requestedModel = selectedModel;
    const ollamaTimeout = MODEL_TIMEOUTS[selectedModel] || DEFAULT_TIMEOUT;
    const timeoutHandle = setTimeout(() => {
      abortReason = 'timeout';
      controller.abort('timeout');
    }, ollamaTimeout);

    let reply;
    try {
      reply = await runOllamaChatStream({
        selectedModel,
        messages,
        options: getChatOptions(selectedModel, chatMode),
        controller,
        firstTokenTimeoutMs: chatMode === 'fast' ? FAST_CHAT_FIRST_TOKEN_TIMEOUT : STANDARD_CHAT_FIRST_TOKEN_TIMEOUT,
        onAbortReason: (reason) => { abortReason = reason; },
      });
    } finally {
      clearTimeout(timeoutHandle);
      clearInterval(stopChecker);
    }

    addToMemory(agentId, 'assistant', reply);

    // Log to active chapter session
    try {
      logAccomplishment(
        'Used ' + agent.name + ' for: ' + message.substring(0, 80) + (message.length > 80 ? '...' : ''),
        agentId
      );
    } catch {}

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveToWorkspace(agentId, `session-${timestamp}.txt`,
      `USER: ${message}\n\n${agent.name.toUpperCase()}: ${reply}`
    );

    try { saveLastTask(agentId, message, reply, { workflowType: 'chat' }); } catch {}

    // Reflection always fires in background — NEVER blocks the response.
    // This is what was causing MCP timeouts: reflection was awaited before returning.
    if (reply.split(' ').length > 30) {
      fetch(OLLAMA_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:14b',
          messages: [{
            role: 'user',
            content: buildReflectionPrompt(agentId, agent.name, message, reply),
          }],
          stream: false,
          options: { temperature: 0.3, num_ctx: 4096, num_predict: 300 },
        }),
      }).then(async r => {
        if (!r.ok) return;
        const d = await r.json();
        let content = (d.message?.content || '{}')
          .replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
        try {
          const ref = JSON.parse(content);
          addLesson(agentId, {
            task: message.substring(0, 200),
            workflowType: 'chat',
            score: Math.max(1, Math.min(10, parseInt(ref.score) || 6)),
            what_worked: ref.what_worked || '',
            what_failed: ref.what_failed || '',
            improvement: ref.improvement || '',
            root_cause: ref.root_cause || '',
            severity: ref.severity || 'moderate',
          });
          await triggerAutoRefine(agentId);
          // addLesson already records wins when score >= 8 - no separate addWin needed
        } catch {}
      }).catch(() => {});
    }

    try { completeProcess(processId, 'complete'); } catch {}

    return Response.json({
      agentId,
      agentName: agent.name,
      reply,
      model: selectedModel,
      chatMode,
      processId,
    });

  } catch (error) {
    try { if (stopChecker) clearInterval(stopChecker); } catch {}
    try { if (processId) completeProcess(processId, 'killed'); } catch {}

    if (error.name === 'AbortError') {
      const reason = abortReason || error.message || '';
      if (reason === 'timeout') {
        const mins = Math.round((MODEL_TIMEOUTS[requestedModel] || DEFAULT_TIMEOUT) / 60000);
        return Response.json({ error: `Request timed out after ${mins} min (model: ${requestedModel}). Try a shorter message or switch to qwen2.5:14b.` }, { status: 408 });
      }
      if (reason === 'first token timeout') {
        const guidance = agentId === 'alex'
          ? 'Try Fast Answer for a quick read, or send the task to DeerFlow if you need deep research.'
          : 'Try a shorter prompt or rerun in fast chat mode.';
        return Response.json({ error: `No response started in time (model: ${requestedModel}). ${guidance}` }, { status: 408 });
      }
      if (reason === 'stream idle timeout') {
        const guidance = agentId === 'alex'
          ? 'Try Fast Answer for a lighter pass, or use DeerFlow for the deeper version.'
          : 'Try again or shorten the request.';
        return Response.json({ error: `The response stalled mid-generation (model: ${requestedModel}). ${guidance}` }, { status: 408 });
      }
      return Response.json({ error: 'Request was stopped.' }, { status: 499 });
    }

    console.error('Agent API error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function buildReflectionPrompt(agentId, agentName, task, output) {
  return `You are ${agentName}, an AI agent at OTG Icon creative agency.

You just completed this task: "${task.substring(0, 200)}"
Your response was ${output.split(' ').length} words long.

Be brutally honest about your performance. Score yourself accurately.
A score of 10 means perfect execution. A score of 1 means complete failure.
Most responses should score between 5-8. Do not default to high scores.

Respond ONLY with this exact JSON, no other text:
{
  "score": <integer 1-10>,
  "what_worked": "<one specific sentence about what you did well>",
  "what_failed": "<one specific sentence about what fell short, even if score is high>",
  "improvement": "<one concrete specific action to improve next time>",
  "root_cause": "<why did this happen>",
  "severity": "<critical|moderate|minor>",
  "is_win": <true if score >= 8>
}`;
}
