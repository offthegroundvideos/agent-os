import { AGENTS, PIPELINE_TYPES, OLLAMA_URL, MODEL_TIMEOUTS, DEFAULT_TIMEOUT } from '../../../lib/agents.js';
import { addToMemory, saveToWorkspace } from '../../../lib/memory.js';
import { buildPipelinePrompt, extractHandoffJson, extractNarrativeSummary, stripThinkBlocks } from '../../../lib/router.js';
import { logHandoff, updateHandoffUsage, completeSession } from '../../../lib/comms.js';
import { registerProcess, completeProcess, isProcessStopped, updateProcessProgress, resumeProcess } from '../../../lib/processes.js';
import { logPipelineRun } from '../../../lib/chapters.js';
import { addLesson, getLessonsPrompt, saveLastTask, triggerAutoRefine } from '../../../lib/learning.js';
import { buildGrowthOSContext } from '../../../lib/growthOS.js';
import { buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';
import { buildCanonicalDataModelContext } from '../../../lib/canonicalDataModel.js';
import { buildContentOSContext } from '../../../lib/contentOS.js';
import { getResearchContextForTopic, getViralSystemAddendum } from '../../../lib/viralResearch.js';
import { createAsset, transitionAsset, updateAssetOutput } from '../../../lib/assets.js';
import { addScript } from '../../../lib/contentRecords.js';
import { autoJobsCanRunInBackground } from '../../../lib/autojobs.js';
import { generateCalendarEntriesForAsset } from '../../../lib/contentCalendar.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
        const asset = createAsset({ topic, title: topic, pipelineType: pipelineType || 'content', owner: 'system' });
        const assetId = asset.id;

        if (isResume) {
          resumeProcess(processId);
        } else {
          registerProcess(processId, 'pipeline', 'Pipeline: ' + topic, {
            pipelineTopic: topic,
            pipelineType: pipelineType || 'content',
            completedStepIndex: 0,
          });
        }
        send({ type: 'start', topic, totalSteps: stepsToRun.length, sessionId, processId, assetId, resumed: isResume, resumeFrom: resumeFrom || 0 });
        send({ type: 'pipeline_type', pipelineType: selectedType.id, label: selectedType.label, totalSteps: stepsToRun.length });

        // completedSteps accumulates handoff context for ALL downstream agents
        // Each entry: { agentId, agentName, role, output, handoffJson, narrativeSummary }
        const completedSteps = [];
        const results = {};

        // If resuming, rebuild completedSteps from prior results so downstream agents have context
        const startIndex = isResume ? resumeFrom : 0;
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

                      // Track <think> blocks — accumulate them in output but don't stream to UI
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

          // HALT pipeline on failure — never pass bad output downstream
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
            completeProcess(processId, 'failed');
            completeSession(sessionId, 'failed');
            controller.close();
            return;
          }

          // Strip deepseek-r1 <think>...</think> blocks — these are internal reasoning
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
          try { saveLastTask(step.agentId, topic + ' — ' + step.label, output, { workflowType: 'pipeline' }); } catch {}

          // Save individual step file with topic in name — findable by topic
          const stepFilename = topicSlug + '-' + step.agentId + '-' + step.label.toLowerCase().replace(/\s+/g, '-') + '.md';
          saveToWorkspace(step.agentId, stepFilename,
            `# ${agent.name} — ${step.label}\nTopic: ${topic}\nDate: ${new Date().toISOString()}\nSession: ${sessionId}\n\n---\n\n${output}`
          );

          // Background reflection — delayed 8s so next agent gets GPU first, 60s timeout so it never hangs
          const reflectAgentId = step.agentId;
          const reflectAgentName = agent.name;
          const reflectOutput = output;
          setTimeout(() => {
            const reflectAbort = new AbortController();
            const reflectTimeout = setTimeout(() => reflectAbort.abort(), 60000);
            fetch(OLLAMA_URL + '/api/chat', {
              method: 'POST',
              signal: reflectAbort.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'qwen2.5:14b',
                messages: [{
                  role: 'user',
                  content: `You are ${reflectAgentName}. Pipeline step "${step.label}" for: "${topic.substring(0, 100)}"\nOutput: ${reflectOutput.split(' ').length} words.\n\nReflect. JSON only:\n{"score":7,"what_worked":"one sentence","what_failed":"one sentence","improvement":"one specific thing","is_win":false}`,
                }],
                stream: false,
                options: { temperature: 0.3, num_ctx: 2048, num_predict: 200 },
              }),
            }).then(async r => {
              clearTimeout(reflectTimeout);
              if (!r.ok) return;
              const d = await r.json();
              let c = (d.message?.content || '{}')
                .replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
              try {
                const ref = JSON.parse(c);
                addLesson(reflectAgentId, {
                  task: topic.substring(0, 200),
                  workflowType: 'pipeline',
                  score: Math.max(1, Math.min(10, parseInt(ref.score) || 7)),
                  what_worked: ref.what_worked || '',
                  what_failed: ref.what_failed || '',
                  improvement: ref.improvement || '',
                });
                await triggerAutoRefine(reflectAgentId);
                // addLesson already records wins when score >= 8 - no separate addWin needed
              } catch {}
            }).catch(() => { clearTimeout(reflectTimeout); });
          }, 8000 + (i * 15000)); // stagger reflections — 8s base + 15s per step so they serialize

          // Track progress so pipeline can be resumed from this point
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

        // Save ONE combined report with ALL agents' full output — topic in filename
        const reportFilename = topicSlug + '-full-pipeline.md';
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
          reportLines.push('## ' + AGENTS[s.agentId].icon + ' ' + AGENTS[s.agentId].name + ' — ' + s.label);
          reportLines.push('*' + AGENTS[s.agentId].role + ' · ' + agentOutput.split(' ').length + ' words*');
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

        // Only run background lead generation when idle auto-jobs are explicitly enabled.
        if (autoJobsCanRunInBackground()) {
          setTimeout(() => {
            const leadPrompt = `You are Luna, OTG Icon's lead qualifier. A pipeline just completed on: "${topic}"

Based on this topic, generate 3-5 detailed potential client leads who would buy THIS specific service.

For EACH lead provide:
1. **Business Name** — realistic business in this niche
2. **Why They Need This** — specific pain point related to "${topic}"
3. **Service Match** — which OTG package (video, photo, social content, full brand)
4. **Budget Range** — realistic estimate
5. **Temperature** — HOT/WARM/COLD
6. **Personalized Pitch** — a ready-to-send outreach message for this lead
7. **Objection & Counter** — what they'll push back on and how to handle it

End with [QUALIFIED] and JSON: {"leads_found":0,"hot_leads":0,"pipeline_topic":"${topic.substring(0, 100)}"}`;

            fetch(OLLAMA_URL + '/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'qwen2.5-ctx32k',
                messages: [
                  { role: 'system', content: AGENTS['luna'].systemPrompt },
                  { role: 'user', content: leadPrompt },
                ],
                stream: false,
                options: { temperature: 0.7, num_ctx: 16384 },
              }),
            }).then(async r => {
              if (!r.ok) return;
              const d = await r.json();
              const output = (d.message?.content || '').replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
              if (output) {
                addToMemory('luna', 'user', '[AUTO] Lead gen for pipeline: ' + topic);
                addToMemory('luna', 'assistant', output);
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                saveToWorkspace('luna', `auto-leads-${topicSlug}-${ts}.md`,
                  `# Auto Lead Generation\nPipeline Topic: ${topic}\nDate: ${new Date().toISOString()}\n\n---\n\n${output}`
                );
              }
            }).catch(() => {});
          }, 10000); // 10s delay so reflections finish first
        }

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
