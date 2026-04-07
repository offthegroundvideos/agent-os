import { AGENTS, OLLAMA_URL } from '../../../lib/agents.js';
import {
  addLesson,
  autoRefineAgent,
  getAllLearning,
  loadLastTask,
  loadLessons,
  triggerAutoRefine,
} from '../../../lib/learning.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { agentId, action } = body;

    if (!agentId) {
      return Response.json({ error: 'Missing agentId' }, { status: 400 });
    }

    if (action === 'refine') {
      return handleRefine(agentId);
    }

    if (action === 'rereflect') {
      const lastTask = loadLastTask(agentId);
      if (!lastTask) {
        return Response.json({ error: 'No recent task found for ' + agentId + '. Run a task first.' }, { status: 404 });
      }
      return handleReflect(agentId, lastTask.task, lastTask.output, body.model, lastTask.workflowType);
    }

    const { task, output, model, workflowType } = body;
    if (!task || !output) {
      return Response.json({ error: 'Missing task or output (or use action: rereflect to use last task)' }, { status: 400 });
    }

    return handleReflect(agentId, task, output, model, workflowType);
  } catch (error) {
    console.error('Reflect error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function handleReflect(agentId, task, output, model, workflowType = 'manual') {
  const wordCount = output.split(' ').length;
  const agentName = AGENTS[agentId]?.name || agentId;

  const reflectionPrompt = `You are ${agentName}, an AI agent at OTG Icon creative agency.

You just completed this task: "${task.substring(0, 200)}"
Your response was ${wordCount} words long.

Be brutally honest about your performance. Score yourself accurately.
A score of 10 means perfect execution. A score of 1 means complete failure.
Most responses should score between 5-8. Do not default to high scores.

Ask yourself:
- Did I fully complete what was asked?
- Was my output specific and actionable or vague and generic?
- Did I stay within my role boundaries?
- Did I provide genuine value or just words?
- What would have made this response significantly better?

Respond ONLY with this exact JSON, no other text:
{
  "score": <integer 1-10>,
  "what_worked": "<one specific sentence about what you did well>",
  "what_failed": "<one specific sentence about what fell short, even if score is high>",
  "improvement": "<one concrete specific action to improve next time>",
  "root_cause": "<why did this happen - be honest>",
  "severity": "<critical|moderate|minor>"
}`;

  const response = await fetch(OLLAMA_URL + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'qwen2.5:14b',
      messages: [{ role: 'user', content: reflectionPrompt }],
      stream: false,
      options: { temperature: 0.3, num_ctx: 4096, num_predict: 300 },
    }),
  });

  if (!response.ok) throw new Error('Ollama error: ' + response.status);

  const data = await response.json();
  let content = (data.message?.content || '{}')
    .replace(/^```json\n?/i, '')
    .replace(/^```\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  let reflection;
  try {
    reflection = JSON.parse(content);
  } catch {
    reflection = {
      score: 6,
      what_worked: 'Task was attempted and completed',
      what_failed: 'Could not parse self-reflection accurately',
      improvement: 'Be more precise and structured in responses',
      root_cause: 'Reflection parsing failed',
      severity: 'moderate',
    };
  }

  reflection.score = Math.max(1, Math.min(10, parseInt(reflection.score) || 6));

  addLesson(agentId, {
    task: task.substring(0, 200),
    workflowType,
    score: reflection.score,
    what_worked: reflection.what_worked || '',
    what_failed: reflection.what_failed || '',
    improvement: reflection.improvement || '',
    root_cause: reflection.root_cause || '',
    severity: reflection.severity || 'moderate',
  });

  await triggerAutoRefine(agentId);

  return Response.json({
    success: true,
    agentId,
    workflowType,
    reflection,
    saved: true,
    scoreCategory: reflection.score >= 9 ? 'excellent' :
      reflection.score >= 7 ? 'good' :
      reflection.score >= 5 ? 'poor' : 'critical',
  });
}

async function handleRefine(agentId) {
  const data = loadLessons(agentId);
  if (!data.lessons || data.lessons.length < 3) {
    return Response.json({
      error: 'Not enough lessons yet - need at least 3 completed tasks before refining skills.',
    }, { status: 400 });
  }

  const result = await autoRefineAgent(agentId, { force: true });

  return Response.json({
    success: true,
    agentId,
    agentName: AGENTS[agentId]?.name || agentId,
    refinements: result.refinements || [],
    lessonCount: result.lessonCount || 0,
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');

    if (agentId) {
      return Response.json(loadLessons(agentId));
    }

    return Response.json(getAllLearning());
  } catch (error) {
    console.error('Reflect GET error:', error);
    return Response.json([], { status: 200 });
  }
}
