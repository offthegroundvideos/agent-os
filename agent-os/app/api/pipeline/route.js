import { AGENTS, PIPELINE_TYPES, OLLAMA_URL, MODEL_TIMEOUTS, DEFAULT_TIMEOUT } from '../../../lib/agents.js';
import { addToMemory, saveToWorkspace } from '../../../lib/memory.js';
import { buildPipelinePrompt, extractHandoffJson, extractNarrativeSummary, stripThinkBlocks } from '../../../lib/router.js';
import { logHandoff, updateHandoffUsage, completeSession } from '../../../lib/comms.js';
import { registerProcess, completeProcess, isProcessStopped, updateProcessProgress, resumeProcess } from '../../../lib/processes.js';
import { logPipelineRun } from '../../../lib/chapters.js';
import { getLessonsPrompt, saveLastTask } from '../../../lib/learning.js';
import { buildGrowthOSContext } from '../../../lib/growthOS.js';
import { buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';
import { buildCanonicalDataModelContext } from '../../../lib/canonicalDataModel.js';
import { buildContentOSContext } from '../../../lib/contentOS.js';
import { getResearchContextForTopic, getViralSystemAddendum } from '../../../lib/viralResearch.js';
import { createAsset, listAssets, transitionAsset, updateAssetOutput } from '../../../lib/assets.js';
import { addScript } from '../../../lib/contentRecords.js';
import { autoJobsCanRunInBackground } from '../../../lib/autojobs.js';
import { generateCalendarEntriesForAsset } from '../../../lib/contentCalendar.js';
import {
  recordPipelineRunComplete,
  recordPipelineRunFailure,
  recordPipelineRunStart,
  recordPipelineRunStep,
} from '../../../lib/durableStore.js';
import {
  queuePipelineLeadGenJob,
  queuePipelineReflectionJob,
} from '../../../lib/backgroundQueue.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

// Sanitize topic string for use as a filename
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
}

function persistScriptsFromHandoff(assetId, handoffJson, topic) {
  const scripts = handoffJson?.outputs?.scripts;
  if (Array.isArray(scripts) && scripts.length > 0) {
    return scripts.map((script, index) => addScript({
      client_id: handoffJson?.outputs?.client_id || 'cli_default',
      campaign_id: handoffJson?.outputs?.campaign_id || 'cmp_default',
      topic_brief_id: handoffJson?.asset_id || 'tpc_default',
      format: script.format || 'talking_head',
      hook_text: script.hook_text || script.hook || '',
      body_bullets: Array.isArray(script.body_bullets) ? script.body_bullets : (Array.isArray(script.value_bullets) ? script.value_bullets : []),
      cta_id: script.cta_id || handoffJson?.outputs?.cta_id || 'cta_default',
      approval_status: 'draft',
      asset_id: assetId,
      agent_id: 'maya',
      created_by: 'maya',
      source_system: 'content_intelligence',
      script_index: index,
    }));
  }

  return [addScript({
    client_id: 'cli_default',
    campaign_id: 'cmp_default',
    topic_brief_id: handoffJson?.asset_id || 'tpc_default',
    format: 'talking_head',
    hook_text: handoffJson?.summary || topic,
    body_bullets: [handoffJson?.summary || 'See source output for full script body'],
    cta_id: handoffJson?.outputs?.cta_id || 'cta_default',
    approval_status: 'draft',
    asset_id: assetId,
    agent_id: 'maya',
    created_by: 'maya',
    source_system: 'content_intelligence',
  })];
}

function buildPipelineSystemPrompt(stepAgentId, topic, agent, researchContext) {
  const baseParts = [
    buildGrowthOSContext(),
    buildContentOSContext(topic, stepAgentId),
    agent.systemPrompt,
    getViralSystemAddendum(stepAgentId),
    researchContext,
    getLessonsPrompt(stepAgentId),
  ];

  // The full architecture and canonical data model contexts are useful, but
  // they are very large and slow down the creative/research pipeline steps.
  // Keep them for technical agents only.
  if (stepAgentId === 'dev' || stepAgentId === 'cto') {
    baseParts.unshift(buildArchitectureTargetContext(stepAgentId));
    baseParts.unshift(buildCanonicalDataModelContext());
  }

  return baseParts.filter(Boolean).join('\n\n');
}

function getPipelineModelOptions(stepAgentId) {
  const shared = { temperature: 0.6, num_ctx: 12288 };
  if (stepAgentId === 'alex') return { temperature: 0.4, num_ctx: 8192 };
  if (stepAgentId === 'iris') return { temperature: 0.4, num_ctx: 8192 };
  if (stepAgentId === 'maya') return { temperature: 0.7, num_ctx: 8192 };
  if (stepAgentId === 'jordan') return { temperature: 0.5, num_ctx: 12288 };
  if (stepAgentId === 'rex') return { temperature: 0.5, num_ctx: 8192 };
  return shared;
}

function getPipelineModelCandidates(stepAgentId) {
  const primaryModel = getAgentModel(stepAgentId);
  const candidates = [primaryModel];

  if (stepAgentId === 'iris') candidates.push('qwen2.5-ctx32k');
  if (stepAgentId === 'maya') candidates.push('qwen2.5-ctx32k');
  if (stepAgentId === 'rex') candidates.push('qwen2.5-ctx32k');

  return [...new Set(candidates)];
}

function getFirstTokenTimeoutMs(stepAgentId) {
  if (stepAgentId === 'alex' || stepAgentId === 'iris') return 45000;
  if (stepAgentId === 'maya') return 60000;
  return 30000;
}

function findExistingPipelineAsset({ topic, pipelineType, startedAt }) {
  const normalizedTopic = String(topic || '').trim().toLowerCase();
  if (!normalizedTopic) return null;

  const startedAtMs = startedAt ? new Date(startedAt).getTime() : 0;
  const candidates = listAssets().filter((asset) => {
    if (String(asset?.topic || '').trim().toLowerCase() !== normalizedTopic) return false;
    if (pipelineType && String(asset?.pipelineType || '').trim() !== String(pipelineType).trim()) return false;
    return true;
  });

  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    const aCreated = new Date(a?.createdAt || a?.updatedAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || b?.updatedAt || 0).getTime();
    const aScore = startedAtMs && aCreated && aCreated >= startedAtMs ? aCreated : aCreated || 0;
    const bScore = startedAtMs && bCreated && bCreated >= startedAtMs ? bCreated : bCreated || 0;
    return bScore - aScore;
  })[0] || null;
}

export async function POST(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) =>
        controller.enqueue(encoder.encode('data: ' + JSON.stringify(data) + '\n\n'));

      const sendToken = (agentId, token) =>
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({
          type: 'token', agentId, token
        }) + '\n\n'));

      try {
        const { topic, pipelineType, resumeFrom, resumeProcessId, priorResults } = await request.json();
        if (!topic) { send({ error: 'Missing topic' }); controller.close(); return; }

        const isResume = typeof resumeFrom === 'number' && resumeFrom > 0;
        const sessionId = isResume && resumeProcessId ? resumeProcessId : 'pipeline-' + Date.now();
        const processId = sessionId;
        const topicSlug = slugify(topic);

        const selectedType = pipelineType && PIPELINE_TYPES[pipelineType]
          ? PIPELINE_TYPES[pipelineType]
          : PIPELINE_TYPES['content'];
        const stepsToRun = selectedType.steps;
        const researchContext = getResearchContextForTopic(topic);
        const existingProcess = isResume ? resumeProcess(processId) : null;
        const assetId = existingProcess?.assetId
          || findExistingPipelineAsset({
            topic,
            pipelineType: pipelineType || 'content',
            startedAt: existingProcess?.startedAt || null,
          })?.id
          || createAsset({ topic, title: topic, pipelineType: pipelineType || 'content', owner: 'system' }).id;

        if (isResume) {
          if (existingProcess && !existingProcess.assetId) {
            updateProcessProgress(processId, { assetId });
          } else if (!existingProcess) {
            registerProcess(processId, 'pipeline', 'Pipeline: ' + topic, {
              pipelineTopic: topic,
              pipelineType: pipelineType || 'content',
              assetId,
              completedStepIndex: resumeFrom || 0,
              resumedFromMissingRecord: true,
            });
          }
        } else {
          registerProcess(processId, 'pipeline', 'Pipeline: ' + topic, {
            pipelineTopic: topic,
            pipelineType: pipelineType || 'content',
            assetId,
            completedStepIndex: 0,
          });
        }
        try {
          recordPipelineRunStart({
            id: processId,
            processId,
            sessionId,
            topic,
            pipelineType: selectedType.id,
            assetId,
            resumeFrom: resumeFrom || 0,
            status: 'running',
            metadata: {
              resumed: isResume,
              source: 'pipeline_route',
            },
          });
        } catch {}
        const runTag = `${topicSlug}-${assetId}`;
        send({ type: 'start', topic, totalSteps: stepsToRun.length, sessionId, processId, assetId, resumed: isResume, resumeFrom: resumeFrom || 0 });
        send({ type: 'pipeline_type', pipelineType: selectedType.id, label: selectedType.label, totalSteps: stepsToRun.length });

        // completedSteps accumulates handoff context for ALL downstream agents
        // Each entry: { agentId, agentName, role, output, handoffJson, narrativeSummary }
        const completedSteps = [];
        const results = {};

        // If resuming, rebuild completedSteps from prior results so downstream agents have context
        const startIndex = isResume
          ? Math.max(0, Math.min(Number(resumeFrom) || 0, stepsToRun.length))
          : 0;
        if (isResume && priorResults) {
          for (let j = 0; j < startIndex && j < stepsToRun.length; j++) {
            const s = stepsToRun[j];
            const prevOutput = priorResults[s.agentId] || '';
            if (prevOutput) {
              completedSteps.push({
                agentId: s.agentId,
                agentName: AGENTS[s.agentId].name,
                role: s.label,
                output: prevOutput,
                handoffJson: extractHandoffJson(s.agentId, prevOutput),
                narrativeSummary: extractNarrativeSummary(s.agentId, prevOutput, 200),
              });
              results[s.agentId] = prevOutput;
            }
            // Send step_complete for already-done steps so the UI rebuilds
            send({
              type: 'step_complete',
              step: j + 1,
              agentId: s.agentId,
              agentName: AGENTS[s.agentId].name,
              output: prevOutput,
              wordCount: prevOutput.split(' ').length,
              hasStructuredHandoff: !!extractHandoffJson(s.agentId, prevOutput),
              resumed: true,
            });
          }
        }

        for (let i = startIndex; i < stepsToRun.length; i++) {

          // Check stop signal before each step
          if (isProcessStopped(processId)) {
            send({ type: 'stopped', message: 'Pipeline stopped by user', completedSteps: i });
            try {
              recordPipelineRunComplete(processId, {
                processId,
                sessionId,
                topic,
                pipelineType: selectedType.id,
                assetId,
                resumeFrom: resumeFrom || 0,
                status: 'stopped',
                eventType: 'stopped',
                message: 'Pipeline stopped by user',
                completedStepCount: i,
              });
            } catch {}
            completeProcess(processId, 'stopped');
            completeSession(sessionId, 'stopped');
            controller.close();
            return;
          }

          const step = stepsToRun[i];
          const agent = AGENTS[step.agentId];
          const nextStep = stepsToRun[i + 1];
          const modelCandidates = getPipelineModelCandidates(step.agentId);
          const agentModel = modelCandidates[0];
          const stepTimeout = Math.max(
            ...modelCandidates.map((candidate) => MODEL_TIMEOUTS[candidate] || DEFAULT_TIMEOUT)
          );
          const firstTokenTimeoutMs = getFirstTokenTimeoutMs(step.agentId);

          send({
            type: 'step_start',
            step: i + 1,
            agentId: step.agentId,
            agentName: agent.name,
            label: step.label,
            model: agentModel,
            timeoutMinutes: Math.round(stepTimeout / 60000),
            processId,
            message: `Starting ${agent.name} on ${agentModel}. First response can take a bit while Ollama loads the model.`,
          });

          let output = '';
          let success = false;
          let lastError = '';
          let prompt = '';
          let finalModelUsed = agentModel;

          for (let attempt = 0; attempt < modelCandidates.length; attempt++) {
            const currentModel = modelCandidates[attempt];
            finalModelUsed = currentModel;

            if (attempt > 0) {
              send({
                type: 'retry',
                agentId: step.agentId,
                attempt: attempt + 1,
                message: `Retrying ${agent.name} with fallback model ${currentModel}.`,
              });
            }

            const abortCtrl = new AbortController();
            let abortReason = 'timeout';
            const timeoutHandle = setTimeout(() => {
              abortReason = 'timeout';
              abortCtrl.abort();
            }, stepTimeout);
            let firstTokenTimeoutHandle = null;

            try {
              // Build prompt with full context bundle from all prior steps
              prompt = buildPipelinePrompt(step.agentId, topic, '', completedSteps, researchContext);

              send({
                type: 'status',
                agentId: step.agentId,
                stage: 'connecting',
                message: `Waiting for ${currentModel} to accept the request...`,
              });

              const ollamaRes = await fetch(OLLAMA_URL + '/api/chat', {
                method: 'POST',
                signal: abortCtrl.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: currentModel,
                  messages: [
                    {
                      role: 'system',
                      content: buildPipelineSystemPrompt(step.agentId, topic, agent, researchContext),
                    },
                    { role: 'user', content: prompt },
                  ],
                  stream: true,
                  options: getPipelineModelOptions(step.agentId),
                }),
              });

              if (!ollamaRes.ok) throw new Error('Ollama error: ' + ollamaRes.status);

              send({
                type: 'status',
                agentId: step.agentId,
                stage: 'stream_open',
                message: `${currentModel} accepted the request. Waiting for first token...`,
              });

              const reader = ollamaRes.body.getReader();
              const decoder = new TextDecoder();
              output = '';
              let inThinkBlock = false;
              let sawVisibleToken = false;
              firstTokenTimeoutHandle = setTimeout(() => {
                abortReason = 'first_token_timeout';
                abortCtrl.abort();
              }, firstTokenTimeoutMs);

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(l => l.trim());

                for (const line of lines) {
                  try {
                    const json = JSON.parse(line);
                    if (json.message?.content) {
                      const token = json.message.content;
                      output += token;

                      // Track <think> blocks â€” accumulate them in output but don't stream to UI
                      if (token.includes('<think>')) inThinkBlock = true;
                      if (!inThinkBlock) {
                        if (!sawVisibleToken) {
                          sawVisibleToken = true;
                          clearTimeout(firstTokenTimeoutHandle);
                          firstTokenTimeoutHandle = null;
                          send({
                            type: 'status',
                            agentId: step.agentId,
                            stage: 'responding',
                            message: `${agent.name} is responding now.`,
                          });
                        }
                        sendToken(step.agentId, token);
                      }
                      if (token.includes('</think>')) inThinkBlock = false;
                    }
                    if (json.done) break;
                  } catch {}
                }

                if (isProcessStopped(processId)) {
                  send({ type: 'stopped', message: 'Stopped during ' + agent.name, completedSteps: i });
                  try {
                    recordPipelineRunComplete(processId, {
                      processId,
                      sessionId,
                      topic,
                      pipelineType: selectedType.id,
                      assetId,
                      resumeFrom: resumeFrom || 0,
                      status: 'stopped',
                      eventType: 'stopped',
                      message: 'Pipeline stopped mid-step',
                      completedStepCount: i,
                    });
                  } catch {}
                  completeProcess(processId, 'stopped');
                  completeSession(sessionId, 'stopped');
                  controller.close();
                  return;
                }
              }

              if (!sawVisibleToken || !output.trim()) {
                throw new Error(`${agent.name} returned no visible output on ${currentModel}`);
              }

              success = true;
              break;

            } catch (err) {
              lastError = err.name === 'AbortError'
                ? (
                    abortReason === 'first_token_timeout'
                      ? `${agent.name} did not emit a first token within ${Math.round(firstTokenTimeoutMs / 1000)}s (model: ${currentModel})`
                      : `${agent.name} timed out after ${Math.round(stepTimeout / 60000)} min (model: ${currentModel})`
                  )
                : err.message;
              if (attempt < modelCandidates.length - 1) {
                send({
                  type: 'status',
                  agentId: step.agentId,
                  stage: 'fallback',
                  message: `${lastError}. Trying fallback model next...`,
                });
                await new Promise(r => setTimeout(r, 1500));
              }
            } finally {
              clearTimeout(timeoutHandle);
              if (firstTokenTimeoutHandle) clearTimeout(firstTokenTimeoutHandle);
            }
          }

          // HALT pipeline on failure â€” never pass bad output downstream
          if (!success) {
            send({
              type: 'step_error',
              step: i + 1,
              agentId: step.agentId,
              agentName: agent.name,
              error: lastError,
              fatal: true,
              message: agent.name + ` failed after trying ${modelCandidates.join(', ')}. Pipeline halted.`,
            });
            try {
              recordPipelineRunFailure(processId, {
                processId,
                sessionId,
                topic,
                pipelineType: selectedType.id,
                assetId,
                resumeFrom: resumeFrom || 0,
                status: 'failed',
                error: lastError || `${agent.name} failed after trying ${modelCandidates.join(', ')}`,
                message: `${agent.name} failed after trying ${modelCandidates.join(', ')}`,
              });
            } catch {}
            completeProcess(processId, 'failed');
            completeSession(sessionId, 'failed');
            controller.close();
            return;
          }

          // Strip deepseek-r1 <think>...</think> blocks â€” these are internal reasoning
          // and must never be passed to downstream agents or they echo the reasoning back
          output = stripThinkBlocks(output);

          results[step.agentId] = output;

          // Measure how well this agent used the previous agent's output (for Comms)
          if (i > 0) {
            const prevStep = stepsToRun[i - 1];
            updateHandoffUsage(sessionId, prevStep.agentId, output);
          }

          // Extract structured handoff data for downstream agents
          const handoffJson = extractHandoffJson(step.agentId, output);
          const narrativeSummary = extractNarrativeSummary(step.agentId, output, 200);
          updateAssetOutput(assetId, step.agentId, { output, handoffJson, narrativeSummary, stepLabel: step.label });

          if (step.agentId === 'maya') {
            try {
              const scriptRecords = persistScriptsFromHandoff(assetId, handoffJson, topic);
              updateAssetOutput(assetId, 'script_records', {
                scriptIds: scriptRecords.map((script) => script.id),
              });
            } catch {}
          }

          if (step.agentId === 'alex') transitionAsset(assetId, 'research_ready', { changedBy: 'system', reason: 'Research completed' });
          if (step.agentId === 'maya') transitionAsset(assetId, 'script_ready', { changedBy: 'system', reason: 'Scripts drafted' });
          if (step.agentId === 'iris') transitionAsset(assetId, 'production_ready', { changedBy: 'system', reason: 'Production brief completed' });
          if (step.agentId === 'sam') transitionAsset(assetId, 'edited', { changedBy: 'system', reason: 'Publishing package prepared' });
          if (step.agentId === 'jordan') transitionAsset(assetId, 'final_qa', { changedBy: 'system', reason: 'Strategy package ready for QA' });

          // Add to completed steps so all future agents see it in their context
          completedSteps.push({
            agentId: step.agentId,
            agentName: agent.name,
            role: step.label,
            output,
            handoffJson,
            narrativeSummary,
          });

          // Log handoff with context quality data
          if (nextStep) {
            const summary = output.split('\n').slice(0, 3).join(' ');
            logHandoff(sessionId, step.agentId, nextStep.agentId, summary, output, topic);
            send({
              type: 'handoff',
              from: step.agentId,
              to: nextStep.agentId,
              toName: AGENTS[nextStep.agentId].name,
              wordCount: output.split(' ').length,
              hasStructuredHandoff: !!handoffJson,
            });
          }

          addToMemory(step.agentId, 'user', prompt);
          addToMemory(step.agentId, 'assistant', output);

          // Store for manual re-reflection from Learn tab
          try { saveLastTask(step.agentId, topic + ' â€” ' + step.label, output, { workflowType: 'pipeline' }); } catch {}

          // Save individual step file with topic in name â€” findable by topic
          const stepFilename = `${runTag}-${step.agentId}-${step.label.toLowerCase().replace(/\s+/g, '-')}.md`;
          saveToWorkspace(step.agentId, stepFilename,
            `# ${agent.name} â€” ${step.label}\nTopic: ${topic}\nDate: ${new Date().toISOString()}\nSession: ${sessionId}\n\n---\n\n${output}`
          );

          // Queue reflection so it survives restarts and runs when the worker is idle.
          try {
            queuePipelineReflectionJob({
              runId: processId,
              processId,
              sessionId,
              topic,
              pipelineType: selectedType.id,
              assetId,
              stepIndex: i + 1,
              agentId: step.agentId,
              agentName: agent.name,
              stepLabel: step.label,
              output,
              workflowType: 'pipeline',
              delayMs: 8000 + (i * 15000),
            });
          } catch {}

          // Track progress so pipeline can be resumed from this point
          updateProcessProgress(processId, { completedStepIndex: i + 1 });

          try {
            recordPipelineRunStep(processId, {
              processId,
              sessionId,
              topic,
              pipelineType: selectedType.id,
              assetId,
              resumeFrom: resumeFrom || 0,
              stepIndex: i + 1,
              agentId: step.agentId,
              agentName: agent.name,
              stepLabel: step.label,
              model: finalModelUsed,
              wordCount: output.split(' ').length,
              hasStructuredHandoff: !!handoffJson,
              narrativeSummary,
              handoffJson,
              output,
              message: `${agent.name} completed ${step.label}`,
            });
          } catch {}
          updateProcessProgress(processId, { completedStepIndex: i + 1 });

          send({
            type: 'step_complete',
            step: i + 1,
            agentId: step.agentId,
            agentName: agent.name,
            assetId,
            model: finalModelUsed,
            output,
            wordCount: output.split(' ').length,
            hasStructuredHandoff: !!handoffJson,
          });
        }

        completeProcess(processId, 'complete');
        completeSession(sessionId, 'complete');

        // Save ONE combined report with ALL agents' full output â€” topic in filename
        const reportFilename = `${runTag}-full-pipeline.md`;
        const reportLines = [
          '# Pipeline Report: ' + topic,
          'Type: ' + selectedType.label,
          'Date: ' + new Date().toISOString(),
          'Session: ' + sessionId,
          '',
          '---',
          '',
        ];
        stepsToRun.forEach(s => {
          const agentOutput = results[s.agentId] || 'No output';
          const hj = completedSteps.find(c => c.agentId === s.agentId)?.handoffJson;
          reportLines.push('## ' + AGENTS[s.agentId].icon + ' ' + AGENTS[s.agentId].name + ' â€” ' + s.label);
          reportLines.push('*' + AGENTS[s.agentId].role + ' Â· ' + agentOutput.split(' ').length + ' words*');
          if (hj) reportLines.push('\n**Structured Data:** `' + JSON.stringify(hj) + '`');
          reportLines.push('');
          reportLines.push(agentOutput);
          reportLines.push('');
          reportLines.push('---');
          reportLines.push('');
        });
        const fullReport = reportLines.join('\n');

        // Save to every participating agent's workspace
        stepsToRun.forEach(s => saveToWorkspace(s.agentId, reportFilename, fullReport));

        try { logPipelineRun(topic, sessionId); } catch {}

        const calendarEntries = generateCalendarEntriesForAsset({
          assetId,
          topic,
          pipelineType: selectedType.id,
          completedSteps,
        });

        if (autoJobsCanRunInBackground()) {
          try {
            queuePipelineLeadGenJob({
              runId: processId,
              processId,
              sessionId,
              topic,
              pipelineType: selectedType.id,
              assetId,
              delayMs: 10000,
            });
          } catch {}
        }

        try {
          recordPipelineRunComplete(processId, {
            processId,
            sessionId,
            topic,
            pipelineType: selectedType.id,
            assetId,
            resumeFrom: resumeFrom || 0,
            status: 'complete',
            reportFilename,
            calendarEntryCount: calendarEntries.length,
            completedStepCount: stepsToRun.length,
          });
        } catch {}

        send({
          type: 'complete',
          topic,
          assetId,
          results,
          sessionId,
          reportFilename,
          topicSlug,
          calendarEntryIds: calendarEntries.map((entry) => entry.id),
          calendarEntryCount: calendarEntries.length,
        });

      } catch (error) {
        send({ type: 'error', error: error.message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function getAgentModel(agentId) {
  const models = {
    alex:   'qwen2.5:14b',
    iris:   'qwen2.5:14b',
    maya:   'qwen2.5:14b',
    jordan: 'qwen2.5:14b',
    sam:    'qwen2.5:14b',
    rex:    'qwen2.5:14b',
    dev:    'qwen2.5-ctx32k',
  };
  return models[agentId] || 'qwen2.5-ctx32k';
}


