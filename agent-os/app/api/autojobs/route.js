import { AGENTS, OLLAMA_URL, DEFAULT_MODEL } from '../../../lib/agents.js';
import { stripThinkBlocks } from '../../../lib/router.js';
import { addToMemory, saveToWorkspace } from '../../../lib/memory.js';
import { addLesson, getLessonsPrompt, saveLastTask, triggerAutoRefine } from '../../../lib/learning.js';
import { buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';
import { buildCanonicalDataModelContext } from '../../../lib/canonicalDataModel.js';
import { buildContentOSContext } from '../../../lib/contentOS.js';
import { registerProcess, completeProcess, getProcesses } from '../../../lib/processes.js';
import {
  getJobsDue,
  markJobRun,
  saveJobResult,
  getJobStatus,
  getJobResults,
  getAutoJobSettings,
  updateAutoJobSettings,
  autoJobsCanRunInBackground,
  AUTO_JOBS,
} from '../../../lib/autojobs.js';

export const dynamic = 'force-dynamic';

// GET — check status or get results
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'settings') {
    return Response.json(getAutoJobSettings());
  }

  if (action === 'results') {
    const agentId = searchParams.get('agentId');
    return Response.json(getJobResults(agentId || null));
  }

  if (action === 'due') {
    return Response.json(getJobsDue());
  }

  return Response.json(getJobStatus());
}

// POST — trigger background jobs
export async function POST(request) {
  const body = await request.json();
  const { action, agentId } = body;
  const activeProcesses = getProcesses().filter((process) => process.status === 'running');
  const hasActivePipeline = activeProcesses.some((process) => process.type === 'pipeline');
  const hasActiveAutoJob = activeProcesses.some((process) => process.id?.startsWith('autojob-'));

  if (action === 'set-mode') {
    return Response.json(updateAutoJobSettings({ mode: body.mode }));
  }

  // Run a single agent's background job
  if (action === 'run-one' && agentId) {
    if (hasActivePipeline || hasActiveAutoJob) {
      return Response.json({ error: 'Auto-jobs are paused while another pipeline or auto-job is running.' }, { status: 409 });
    }
    const job = AUTO_JOBS[agentId];
    if (!job) return Response.json({ error: 'No background job for ' + agentId }, { status: 404 });
    const result = await runJob(agentId, job);
    return Response.json(result);
  }

  // Run all due jobs
  if (action === 'run-due') {
    if (!autoJobsCanRunInBackground()) {
      return Response.json({ message: 'Auto-jobs are in manual mode.', ran: 0, skipped: true });
    }
    if (hasActivePipeline || hasActiveAutoJob) {
      return Response.json({ message: 'Skipped auto-jobs because another pipeline or auto-job is active.', ran: 0, skipped: true });
    }
    const due = getJobsDue();
    if (due.length === 0) return Response.json({ message: 'No jobs due', ran: 0 });

    // Run them sequentially to avoid GPU contention
    const results = [];
    for (const job of due) {
      const result = await runJob(job.agentId, job);
      results.push(result);
    }
    return Response.json({ ran: results.length, results });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

async function runJob(agentId, job) {
  const agent = AGENTS[agentId];
  if (!agent) return { error: 'Unknown agent: ' + agentId };

  const processId = 'autojob-' + agentId + '-' + Date.now();
  registerProcess(processId, 'agent', '🤖 Auto: ' + job.name);

  markJobRun(agentId);

  try {
    const response = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: [buildArchitectureTargetContext(agentId), buildCanonicalDataModelContext(), buildContentOSContext(job.prompt, agentId), agent.systemPrompt, getLessonsPrompt(agentId)].filter(Boolean).join('\n\n') },
          { role: 'user', content: job.prompt },
        ],
        stream: false,
        options: { temperature: 0.7, num_ctx: 16384 },
      }),
    });

    if (!response.ok) throw new Error('Ollama error: ' + response.status);

    const data = await response.json();
    const output = stripThinkBlocks(data.message?.content || 'No response');

    // Save to agent's memory and workspace
    addToMemory(agentId, 'user', '[AUTO] ' + job.name);
    addToMemory(agentId, 'assistant', output);
    saveLastTask(agentId, '[AUTO] ' + job.name, output, { workflowType: 'autojob' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    saveToWorkspace(agentId, `auto-${job.name.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.md`,
      `# ${job.name} (Auto)\nAgent: ${agent.name}\nDate: ${new Date().toISOString()}\n\n---\n\n${output}`
    );

    // Save result after the run completes
    saveJobResult(agentId, job.name, output);

    // Background reflection
    if (output.split(' ').length > 30) {
      fetch(OLLAMA_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:14b',
          messages: [{ role: 'user', content: `You are ${agent.name}. Auto-task "${job.name}".\nOutput: ${output.split(' ').length} words.\n\nReflect. JSON only:\n{"score":7,"what_worked":"one sentence","what_failed":"one sentence","improvement":"one specific thing"}` }],
          stream: false,
          options: { temperature: 0.3, num_ctx: 2048, num_predict: 200 },
        }),
      }).then(async r => {
        if (!r.ok) return;
        const d = await r.json();
        let c = (d.message?.content || '{}').replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
        try {
          const ref = JSON.parse(c);
          addLesson(agentId, {
            task: '[AUTO] ' + job.name,
            workflowType: 'autojob',
            score: Math.max(1, Math.min(10, parseInt(ref.score) || 7)),
            what_worked: ref.what_worked || '',
            what_failed: ref.what_failed || '',
            improvement: ref.improvement || '',
          });
          await triggerAutoRefine(agentId);
        } catch {}
      }).catch(() => {});
    }

    completeProcess(processId, 'complete');
    return { agentId, jobName: job.name, success: true, wordCount: output.split(' ').length, output: output.substring(0, 500) };

  } catch (err) {
    completeProcess(processId, 'failed');
    return { agentId, jobName: job.name, success: false, error: err.message };
  }
}
