import fs from 'fs';
import path from 'path';
import { getRoutingDecision } from './routingPolicy.js';

const DEERFLOW_URL = process.env.DEERFLOW_URL || 'http://localhost:2026';
const DATA_FILE = path.join(process.cwd(), 'data', 'deerflow-jobs.json');

function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ jobs: [], lastUpdated: null }, null, 2));
  }
}

function loadStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { jobs: [], lastUpdated: null };
  }
}

function saveStore(store) {
  ensureStore();
  store.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function createId() {
  return `dfj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function compact(value = '', max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function shouldAutoDispatchToDeerFlow(agentId = '', message = '') {
  return getRoutingDecision({ agentId, message }).lane === 'deerflow';
}

export function inferRepoPath(message = '') {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('deer-flow') || lower.includes('deerflow')) return 'C:\\AI-Agents\\deer-flow';
  if (lower.includes('mcp-server') || lower.includes('mcp server')) return 'C:\\AI-Agents\\mcp-server';
  if (lower.includes('life-os') || lower.includes('life os')) return 'C:\\AI-Agents\\life-os';
  return 'C:\\AI-Agents\\agent-os';
}

function inferValidationCommand(repoPath = '') {
  if (repoPath.endsWith('agent-os')) return 'npm run build';
  if (repoPath.endsWith('deer-flow')) return 'make lint';
  if (repoPath.endsWith('mcp-server')) return 'npm start';
  if (repoPath.endsWith('life-os')) return 'python -m compileall scripts';
  return 'run the project-native validation command if available';
}

function extractAssistantReply(result) {
  const messages = Array.isArray(result?.messages) ? result.messages : Array.isArray(result) ? result : [];
  const aiMessages = messages.filter((item) => String(item?.type || item?.role || '').toLowerCase() === 'ai');
  const last = aiMessages[aiMessages.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content.map((item) => item?.text || item?.content || '').join('').trim();
  }
  return String(last.content || '').trim();
}

export function listDeerFlowJobs() {
  const store = loadStore();
  return (store.jobs || []).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

export function getRepoOptions() {
  return [
    { id: 'agent-os', label: 'Agent OS', path: 'C:\\AI-Agents\\agent-os', validation: 'npm run build' },
    { id: 'deer-flow', label: 'DeerFlow', path: 'C:\\AI-Agents\\deer-flow', validation: 'make lint' },
    { id: 'mcp-server', label: 'MCP Server', path: 'C:\\AI-Agents\\mcp-server', validation: 'npm start' },
    { id: 'life-os', label: 'Life OS', path: 'C:\\AI-Agents\\life-os', validation: 'python -m compileall scripts' },
  ];
}

function recordJob(job) {
  const store = loadStore();
  store.jobs.unshift(job);
  saveStore(store);
}

function updateJob(jobId, updates = {}) {
  const store = loadStore();
  const index = store.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) return null;
  store.jobs[index] = { ...store.jobs[index], ...updates, updatedAt: new Date().toISOString() };
  saveStore(store);
  return store.jobs[index];
}

function buildCodingPrompt({ repoPath, validation, message, mobileMode = false, operatorNotes = '', returnStyle = 'standard' }) {
  const repoName = path.basename(repoPath || '') || 'repository';
  const responseInstruction = returnStyle === 'concise'
    ? [
        'Return in a concise mobile-friendly format:',
        '- scope chosen',
        '- files changed',
        '- verification',
        '- next risk',
      ]
    : [
        'Return:',
        '- short summary',
        '- changed files',
        '- verification performed',
        '- remaining risks',
      ];

  return [
    'Use the OTG auto-coder operating pattern.',
    `Repository: ${repoPath}`,
    `Repository label: ${repoName}`,
    `Task: ${message}`,
    'Write scope: inspect the repository, find the smallest safe bounded implementation slice, then implement only that slice.',
    `Validation: ${validation}`,
    mobileMode
      ? 'Operator context: this request may have been launched from mobile while on the go, so do not require a perfect spec. Infer the smallest safe slice, keep the response scan-friendly, and avoid asking for avoidable clarification.'
      : 'Operator context: use normal bounded coding behavior.',
    operatorNotes ? `Operator notes: ${operatorNotes}` : '',
    'Constraints:',
    '- Do not revert unrelated changes.',
    '- Keep the implementation bounded.',
    '- Match existing repo patterns.',
    '- Report changed files.',
    '- Report validation results.',
    '- If the task is too broad, narrow it before coding and state the chosen scope.',
    ...responseInstruction,
  ].filter(Boolean).join('\n');
}

function buildResearchPrompt({ message }) {
  return [
    'Run a deep research workflow for Agent OS.',
    `Research task: ${message}`,
    'Requirements:',
    '- use web research and multi-step synthesis where helpful',
    '- identify concrete examples, patterns, and gaps',
    '- distinguish signal from speculation',
    '- if the task spans platforms, keep platform-specific findings separate first, then synthesize themes second',
    '- keep recommendations actionable for a creative agency operator',
    'Return:',
    '- executive summary',
    '- key findings',
    '- specific examples or sources inspected',
    '- what to do next',
    '- remaining uncertainties',
  ].join('\n');
}

async function runDeerFlowTask({
  agentId,
  taskType,
  message,
  repoPath = '',
  validation = '',
  mobileMode = false,
  operatorNotes = '',
  returnStyle = 'standard',
}) {
  const job = {
    id: createId(),
    agentId,
    taskType,
    message: compact(message, 1200),
    repoPath,
    validation,
    mobileMode,
    operatorNotes: compact(operatorNotes, 600),
    returnStyle,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  recordJob(job);

  const prompt = taskType === 'research'
    ? buildResearchPrompt({ message })
    : buildCodingPrompt({ repoPath, validation, message, mobileMode, operatorNotes, returnStyle });

  try {
    updateJob(job.id, { status: 'running' });
    const response = await fetch(`${DEERFLOW_URL.replace(/\/$/, '')}/api/runs/wait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          messages: [{ role: 'user', content: prompt }],
        },
        config: {
          configurable: {
            model_name: taskType === 'research' ? 'qwen2.5-ctx32k' : 'qwen2.5-14b',
            thinking_enabled: taskType === 'research',
            subagent_enabled: true,
            is_plan_mode: false,
          },
        },
        metadata: {
          source: 'agent-os',
          bridge: 'deerflow',
          agent_id: agentId,
          task_type: taskType,
          repo_path: repoPath,
          mobile_mode: mobileMode,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`DeerFlow request failed (${response.status}) ${text}`.trim());
    }

    const result = await response.json();
    const reply = extractAssistantReply(result) || 'DeerFlow completed the task but returned no assistant summary.';
    const updated = updateJob(job.id, {
      status: 'complete',
      result,
      reply: compact(reply, 4000),
    });

    return {
      delegated: true,
      taskType,
      reply,
      repoPath,
      validation,
      job: updated || job,
    };
  } catch (error) {
    const updated = updateJob(job.id, {
      status: 'failed',
      error: error.message,
    });
    throw Object.assign(new Error(error.message), { deerflowJob: updated || job });
  }
}

export async function dispatchBoundedCodingTask({ agentId, message, repoPath: explicitRepoPath = '', validation: explicitValidation = '', mobileMode = false, operatorNotes = '', returnStyle = 'standard' }) {
  const repoPath = explicitRepoPath || inferRepoPath(message);
  const validation = explicitValidation || inferValidationCommand(repoPath);
  return runDeerFlowTask({
    agentId,
    taskType: 'coding',
    message,
    repoPath,
    validation,
    mobileMode,
    operatorNotes,
    returnStyle,
  });
}

export async function dispatchDeepResearchTask({ agentId, message, mobileMode = false, operatorNotes = '', returnStyle = 'standard' }) {
  return runDeerFlowTask({
    agentId,
    taskType: 'research',
    message,
    repoPath: '',
    validation: '',
    mobileMode,
    operatorNotes,
    returnStyle,
  });
}

export async function dispatchDeerFlowTask(options) {
  const { agentId, message } = options || {};
  const normalized = String(agentId || '').toLowerCase();
  if (normalized === 'alex') {
    return dispatchDeepResearchTask(options || {});
  }
  return dispatchBoundedCodingTask(options || {});
}
