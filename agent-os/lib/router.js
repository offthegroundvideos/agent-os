import { SHORTCUTS, ROUTER_KEYWORDS, COMPLETION_MARKERS, STANDARD_HANDOFF_INSTRUCTIONS, buildPipelinePromptBody } from './agents.js';

// deepseek-r1 outputs <think>...</think> blocks before its actual response.
// These must be stripped before passing output to other agents or they echo the reasoning.
export function stripThinkBlocks(output) {
  return output.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

export function routeMessage(message) {
  const lower = message.toLowerCase().trim();

  for (const [shortcut, agentId] of Object.entries(SHORTCUTS)) {
    if (lower.startsWith(shortcut)) {
      return {
        agentId,
        message: message.replace(new RegExp('^' + shortcut + '\\s*', 'i'), '').trim(),
        method: 'shortcut',
      };
    }
  }

  if (lower.startsWith('run full pipeline on') || lower.startsWith('run pipeline on')) {
    const topic = message.replace(/^run (full )?pipeline on\s*/i, '').trim();
    return { agentId: 'pipeline', message: topic, method: 'pipeline' };
  }

  const scores = {};
  for (const [agentId, keywords] of Object.entries(ROUTER_KEYWORDS)) {
    scores[agentId] = keywords.filter(k => lower.includes(k)).length;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const runnerUp = sorted[1];

  if (top && top[1] >= 2) {
    return { agentId: top[0], message, method: 'auto-routed' };
  }
  if (top && top[1] === 1 && runnerUp && runnerUp[1] === 0) {
    return { agentId: top[0], message, method: 'auto-routed' };
  }

  return { agentId: 'alex', message, method: 'default' };
}

function extractBalancedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function extractHandoffJson(agentId, output) {
  const marker = COMPLETION_MARKERS[agentId];
  if (!marker || !output.includes(marker)) return null;
  const after = output.substring(output.indexOf(marker) + marker.length).trim();
  const jsonText = extractBalancedJson(after);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

export function extractNarrativeSummary(agentId, output, wordCap = 600) {
  const marker = COMPLETION_MARKERS[agentId];
  const narrative = (marker && output.includes(marker))
    ? output.substring(0, output.indexOf(marker)).trim()
    : output.trim();
  const words = narrative.split(/\s+/);
  if (words.length <= wordCap) return narrative;
  return words.slice(0, wordCap).join(' ') + '\n[...summary truncated for handoff efficiency]';
}

export function buildHandoffContext(completedSteps) {
  if (!completedSteps || completedSteps.length === 0) return '';

  const lines = ['[CONTEXT FROM PRIOR AGENTS - reference the data, do NOT repeat or summarize it]'];

  for (const step of completedSteps) {
    lines.push(`${step.agentName} (${step.role}):`);
    if (step.handoffJson) {
      lines.push(JSON.stringify(step.handoffJson));
    }
    if (step.narrativeSummary) {
      const brief = step.narrativeSummary
        .split(/[.!?\n]/)
        .filter(s => s.trim())
        .slice(0, 3)
        .join('. ')
        .trim();
      if (brief) lines.push(brief + '.');
    }
    lines.push('');
  }

  lines.push('[END CONTEXT - begin YOUR deliverables now, never repeat what is above]');
  return lines.join('\n');
}

export function buildPipelinePrompt(agentId, topic, previousOutput, completedSteps = [], researchContext = '') {
  const base = `You are working as part of the OTG Icon agency pipeline.\nTOPIC: "${topic}"\n\n`;
  const groundedResearch = researchContext ? researchContext + '\n\n' : '';
  const context = completedSteps.length > 0
    ? buildHandoffContext(completedSteps) + '\n\n'
    : (previousOutput ? 'PREVIOUS AGENT OUTPUT:\n' + previousOutput + '\n\n' : '');

  const roleBody = buildPipelinePromptBody(agentId);
  const basePrompt = roleBody
    ? base + groundedResearch + context + roleBody
    : base + groundedResearch + context + 'Complete your role in this OTG Icon pipeline for topic: ' + topic;
  const handoffInstruction = STANDARD_HANDOFF_INSTRUCTIONS[agentId];
  return handoffInstruction ? basePrompt + '\n\n' + handoffInstruction : basePrompt;
}
