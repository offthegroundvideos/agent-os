import fs from 'fs';
import path from 'path';
import { AGENTS, OLLAMA_URL } from './agents.js';

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');
const AUTO_REFINE_MIN_LESSONS = 3;
const AUTO_REFINE_INTERVAL = 5;
const AUTO_REFINE_MAX_LESSONS = 15;
const WORKFLOW_TYPES = ['chat', 'pipeline', 'autojob', 'n8n', 'manual'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeWorkflowType(workflowType) {
  return WORKFLOW_TYPES.includes(workflowType) ? workflowType : 'manual';
}

function createWorkflowStats() {
  return WORKFLOW_TYPES.reduce((acc, workflowType) => {
    acc[workflowType] = {
      taskCount: 0,
      avgScore: 0,
      winCount: 0,
      failureCount: 0,
      lastUsedAt: null,
      scoreTrend: [],
    };
    return acc;
  }, {});
}

function ensureLearningShape(agentId, rawData = {}) {
  const data = {
    agentId,
    lessons: [],
    wins: [],
    failures: [],
    taskCount: 0,
    avgScore: 0,
    lastReflection: null,
    workflowStats: createWorkflowStats(),
    ...rawData,
  };

  data.workflowStats = { ...createWorkflowStats(), ...(rawData.workflowStats || {}) };
  WORKFLOW_TYPES.forEach((workflowType) => {
    data.workflowStats[workflowType] = {
      taskCount: 0,
      avgScore: 0,
      winCount: 0,
      failureCount: 0,
      lastUsedAt: null,
      scoreTrend: [],
      ...(data.workflowStats[workflowType] || {}),
    };
    data.workflowStats[workflowType].scoreTrend = Array.isArray(data.workflowStats[workflowType].scoreTrend)
      ? data.workflowStats[workflowType].scoreTrend.slice(-10)
      : [];
  });

  let needsRebuild = false;
  (data.lessons || []).forEach((lesson) => {
    const normalized = normalizeWorkflowType(lesson.workflowType);
    if (lesson.workflowType !== normalized) {
      lesson.workflowType = normalized;
      needsRebuild = true;
    }
  });
  (data.wins || []).forEach((win) => {
    const normalized = normalizeWorkflowType(win.workflowType);
    if (win.workflowType !== normalized) {
      win.workflowType = normalized;
      needsRebuild = true;
    }
  });
  (data.failures || []).forEach((failure) => {
    const normalized = normalizeWorkflowType(failure.workflowType);
    if (failure.workflowType !== normalized) {
      failure.workflowType = normalized;
      needsRebuild = true;
    }
  });

  if (!rawData.workflowStats || needsRebuild) {
    recalculateWorkflowStats(data);
  }

  return data;
}

function recalculateWorkflowStats(data) {
  const workflowStats = createWorkflowStats();

  (data.lessons || []).forEach((lesson) => {
    const workflowType = normalizeWorkflowType(lesson.workflowType);
    const score = lesson.score || 0;
    const bucket = workflowStats[workflowType];
    bucket.taskCount += 1;
    if (score >= 8) bucket.winCount += 1;
    if (score < 7) bucket.failureCount += 1;
    if (lesson.timestamp && (!bucket.lastUsedAt || lesson.timestamp > bucket.lastUsedAt)) {
      bucket.lastUsedAt = lesson.timestamp;
    }
    if (score) bucket.scoreTrend.push(score);
  });

  Object.values(workflowStats).forEach((bucket) => {
    bucket.scoreTrend = bucket.scoreTrend.slice(-10);
    if (bucket.scoreTrend.length > 0) {
      bucket.avgScore = Math.round((bucket.scoreTrend.reduce((sum, score) => sum + score, 0) / bucket.scoreTrend.length) * 10) / 10;
    }
  });

  data.workflowStats = workflowStats;
}

export function loadLessons(agentId) {
  ensureDir(MEMORY_DIR);
  const p = path.join(MEMORY_DIR, `${agentId}-lessons.json`);
  const defaultData = ensureLearningShape(agentId);
  if (!fs.existsSync(p)) return defaultData;
  try { return ensureLearningShape(agentId, JSON.parse(fs.readFileSync(p, 'utf-8'))); }
  catch { return defaultData; }
}

export function saveLessons(agentId, data) {
  ensureDir(MEMORY_DIR);
  fs.writeFileSync(
    path.join(MEMORY_DIR, `${agentId}-lessons.json`),
    JSON.stringify(data, null, 2)
  );
}

export function addLesson(agentId, lesson) {
  const data = loadLessons(agentId);
  const score = lesson.score || 5;
  const workflowType = normalizeWorkflowType(lesson.workflowType);

  const entry = {
    ...lesson,
    workflowType,
    timestamp: new Date().toISOString(),
    id: Date.now().toString(),
    scoreCategory: score >= 9 ? 'excellent' :
                   score >= 7 ? 'good' :
                   score >= 5 ? 'poor' : 'critical',
  };

  // All lessons go into main lessons array
  data.lessons.push(entry);
  if (data.lessons.length > 100) data.lessons = data.lessons.slice(-100);

  // Categorize into wins vs failures
  if (score >= 8) {
    // Save as a win
    data.wins = data.wins || [];
    data.wins.push({
      description: lesson.what_worked || 'Strong performance',
      task: lesson.task?.substring(0, 100) || '',
      score,
      workflowType,
      timestamp: new Date().toISOString(),
    });
    if (data.wins.length > 30) data.wins = data.wins.slice(-30);
  }

  if (score < 7) {
    // Save as a failure to learn from
    data.failures = data.failures || [];
    data.failures.push({
      description: lesson.what_failed || 'Performance below standard',
      task: lesson.task?.substring(0, 100) || '',
      fix: lesson.improvement || 'Review and retry with better approach',
      score,
      severity: score < 5 ? 'critical' : 'moderate',
      workflowType,
      timestamp: new Date().toISOString(),
    });
    if (data.failures.length > 30) data.failures = data.failures.slice(-30);
  }

  // Update stats
  data.taskCount = (data.taskCount || 0) + 1;
  data.lastReflection = new Date().toISOString();

  // Recalculate rolling average from last 20 tasks
  const recent = data.lessons.slice(-20).filter(l => l.score);
  if (recent.length > 0) {
    data.avgScore = Math.round(
      recent.reduce((sum, l) => sum + l.score, 0) / recent.length * 10
    ) / 10;
  }

  recalculateWorkflowStats(data);

  saveLessons(agentId, data);
  return data;
}

function getLessonsSinceRefinement(data) {
  if (!data.refinedAt) return data.lessons?.length || 0;
  const refinedAt = new Date(data.refinedAt).getTime();
  return (data.lessons || []).filter((lesson) => {
    const timestamp = Date.parse(lesson.timestamp || '');
    return Number.isFinite(timestamp) && timestamp > refinedAt;
  }).length;
}

export function addWin(agentId, win) {
  const data = loadLessons(agentId);
  data.wins = data.wins || [];
  data.wins.push({
    description: win,
    timestamp: new Date().toISOString(),
  });
  if (data.wins.length > 30) data.wins = data.wins.slice(-30);
  saveLessons(agentId, data);
}

export function getLessonsPrompt(agentId) {
  const data = loadLessons(agentId);

  const hasContent = (data.lessons?.length || 0) > 0 ||
                     (data.wins?.length || 0) > 0 ||
                     (data.failures?.length || 0) > 0;

  if (!hasContent) return '';

  let prompt = '\n\n=== YOUR PERFORMANCE HISTORY ===\n';
  prompt += `Tasks completed: ${data.taskCount || 0}. Rolling average score: ${data.avgScore || 0}/10.\n\n`;

  // Refined skill upgrades take priority — these are synthesized patterns, not raw observations
  if (data.refinements?.length > 0) {
    prompt += 'SKILL UPGRADES — apply these to EVERY response:\n';
    data.refinements.forEach(r => { prompt += `⬆ ${r}\n`; });
    prompt += '\n';
  }

  // Wins — what to keep doing
  if (data.wins?.length > 0) {
    prompt += 'WHAT YOU DO WELL — keep doing these:\n';
    data.wins.slice(-5).forEach(w => {
      prompt += `✓ ${w.description}\n`;
    });
    prompt += '\n';
  }

  // Recent improvements from all lessons
  const recentImprovements = data.lessons
    ?.slice(-15)
    .filter(l => l.improvement)
    .map(l => l.improvement) || [];

  if (recentImprovements.length > 0) {
    prompt += 'LESSONS LEARNED — apply these every time:\n';
    // Deduplicate similar lessons
    const unique = [...new Set(recentImprovements)].slice(-8);
    unique.forEach(imp => { prompt += `→ ${imp}\n`; });
    prompt += '\n';
  }

  // Critical failures — explicitly avoid these
  const criticalFailures = data.failures
    ?.filter(f => f.severity === 'critical')
    .slice(-5) || [];

  if (criticalFailures.length > 0) {
    prompt += 'CRITICAL MISTAKES — never repeat these:\n';
    criticalFailures.forEach(f => {
      prompt += `✗ ${f.description} → Fix: ${f.fix}\n`;
    });
    prompt += '\n';
  }

  // Recent moderate failures
  const moderateFailures = data.failures
    ?.filter(f => f.severity === 'moderate')
    .slice(-3) || [];

  if (moderateFailures.length > 0) {
    prompt += 'RECENT AREAS TO IMPROVE:\n';
    moderateFailures.forEach(f => {
      prompt += `⚠ ${f.description} → ${f.fix}\n`;
    });
    prompt += '\n';
  }

  prompt += '=== END PERFORMANCE HISTORY ===\n';
  return prompt;
}

// Store the most recent task/output per agent so the Learn tab can trigger re-reflection
export function saveLastTask(agentId, task, output, options = {}) {
  ensureDir(MEMORY_DIR);
  const p = path.join(MEMORY_DIR, `${agentId}-last-task.json`);
  fs.writeFileSync(p, JSON.stringify({
    task: task.substring(0, 500),
    output: output.substring(0, 3000),
    workflowType: normalizeWorkflowType(options.workflowType),
    savedAt: new Date().toISOString(),
  }, null, 2));
}

export function loadLastTask(agentId) {
  const p = path.join(MEMORY_DIR, `${agentId}-last-task.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

// Synthesize patterns across recent lessons into consolidated skill upgrades.
// Called manually from Learn tab or after every 10 new lessons.
export function saveRefinements(agentId, refinements) {
  const data = loadLessons(agentId);
  data.refinements = refinements;
  data.refinedAt = new Date().toISOString();
  saveLessons(agentId, data);
}

export function shouldAutoRefine(agentId) {
  const data = loadLessons(agentId);
  if ((data.lessons?.length || 0) < AUTO_REFINE_MIN_LESSONS) return false;
  return getLessonsSinceRefinement(data) >= AUTO_REFINE_INTERVAL;
}

export async function autoRefineAgent(agentId, options = {}) {
  const data = loadLessons(agentId);
  if ((data.lessons?.length || 0) < AUTO_REFINE_MIN_LESSONS) {
    return { success: false, skipped: true, reason: 'not_enough_lessons' };
  }

  const force = options.force === true;
  if (!force && !shouldAutoRefine(agentId)) {
    return { success: false, skipped: true, reason: 'threshold_not_met' };
  }

  const agentName = AGENTS[agentId]?.name || agentId;
  const recentLessons = (data.lessons || []).slice(-AUTO_REFINE_MAX_LESSONS);
  const lessonSummary = recentLessons.map((lesson, index) =>
    `[${index + 1}] Score ${lesson.score || 'n/a'}/10 - Task: ${(lesson.task || '').substring(0, 120)}
   Worked: ${lesson.what_worked || 'n/a'}
   Failed: ${lesson.what_failed || 'n/a'}
   Improve: ${lesson.improvement || 'n/a'}`
  ).join('\n\n');

  const refinePrompt = `You are analyzing the performance history of an AI agent named ${agentName}.

Here are the most recent lessons from real runs:

${lessonSummary}

Write exactly 3-5 permanent skill upgrades this agent should apply to future work.

Rules:
- Each upgrade must be a single sentence.
- Start each sentence with a verb.
- Base every upgrade on repeated patterns in the lessons.
- Prefer concrete behavioral rules over vague advice.

Respond only as JSON:
{"refinements":["upgrade 1","upgrade 2","upgrade 3"]}`;

  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || 'qwen2.5:14b',
      messages: [{ role: 'user', content: refinePrompt }],
      stream: false,
      options: { temperature: 0.35, num_ctx: 8192, num_predict: 400 },
    }),
  });

  if (!response.ok) {
    throw new Error('Ollama error: ' + response.status);
  }

  const resp = await response.json();
  let content = (resp.message?.content || '{}')
    .replace(/^```json\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  let refinements = [];
  try {
    const parsed = JSON.parse(content);
    refinements = Array.isArray(parsed.refinements) ? parsed.refinements.filter(Boolean) : [];
  } catch {
    throw new Error('Could not parse refinements from model response');
  }

  if (refinements.length === 0) {
    throw new Error('Model returned no refinements');
  }

  saveRefinements(agentId, refinements.slice(0, 5));
  return {
    success: true,
    skipped: false,
    agentId,
    refinements: refinements.slice(0, 5),
    lessonCount: recentLessons.length,
  };
}

export function triggerAutoRefine(agentId, options = {}) {
  if (!options.force && !shouldAutoRefine(agentId)) {
    return Promise.resolve({ success: false, skipped: true, reason: 'threshold_not_met' });
  }

  return autoRefineAgent(agentId, options).catch((error) => ({
    success: false,
    skipped: false,
    error: error.message,
  }));
}

export function getAllLearning() {
  return ['alex', 'maya', 'jordan', 'dev', 'sam',
          'luna', 'iris', 'rex', 'nova', 'pixel',
          'ceo', 'cto'].map(agentId => {
    const data = loadLessons(agentId);
    // Score trend: last 10 scores for sparkline
    const scoreTrend = data.lessons?.slice(-10).map(l => l.score) || [];
    return {
      agentId,
      taskCount: data.taskCount || 0,
      avgScore: data.avgScore || 0,
      lessonCount: data.lessons?.length || 0,
      winCount: data.wins?.length || 0,
      failureCount: data.failures?.length || 0,
      criticalCount: data.failures?.filter(f => f.severity === 'critical').length || 0,
      lastReflection: data.lastReflection,
      scoreTrend,
      workflowStats: data.workflowStats || createWorkflowStats(),
      refinements: data.refinements || [],
      refinedAt: data.refinedAt || null,
    };
  });
}
