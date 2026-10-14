import { formatDollars } from '../budget.js';

export const CHAT_SYSTEM = [
  'You are OTG-OS, the operating assistant for OFF THE GROUND (MadeByOTG.com), a photo, video and drone production company based in Fairfax, California, run by Jack Riggs.',
  'You are talking with Jack in Telegram on his phone. Answer in a few short sentences.',
  'Use the tools to look up facts. Never invent numbers, bookings, clients or results; if the tools do not have it, say so plainly.',
  'When search_live is available, use it for questions about what is happening now on X or the web, and include the most useful links in your answer.',
].join(' ');

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false };

export const CHAT_TOOLS = [
  { name: 'get_budget_status', description: 'Month-to-date AI and data spend, the monthly cap, and whether paid calls are allowed.', strict: true, input_schema: NO_INPUT },
  { name: 'list_pending_approvals', description: 'Actions waiting for Jack to approve, edit or reject.', strict: true, input_schema: NO_INPUT },
  {
    name: 'list_recent_actions',
    description: 'The most recent actions in the ledger with their status and the reason they were taken. limit is 1 to 20.',
    strict: true,
    input_schema: { type: 'object', properties: { limit: { type: 'integer' } }, required: ['limit'], additionalProperties: false },
  },
  { name: 'list_autonomy_levels', description: 'The current autonomy level (Ask, Tell or Silent) and ceiling for each action type.', strict: true, input_schema: NO_INPUT },
  { name: 'get_system_status', description: 'Whether OTG-OS is paused.', strict: true, input_schema: NO_INPUT },
];

export const SEARCH_TOOL = {
  name: 'search_live',
  description: 'Search X (Twitter) and/or the web right now through Grok. Costs a few cents per search, so only use it when the question needs current outside information.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for.' },
      sources: { type: 'string', enum: ['x', 'web', 'both'] },
    },
    required: ['query', 'sources'],
    additionalProperties: false,
  },
};

function summarize(action) {
  return { id: action.id, type: action.actionType, status: action.status, goal: action.why.goal, expected: action.why.expected, created: action.createdAt };
}

export function createChat({ router, ledger, budget, gate, settings, liveSearch = null, maxSteps = 5 }) {
  const tools = liveSearch ? [...CHAT_TOOLS, SEARCH_TOOL] : CHAT_TOOLS;

  async function runTool(name, input = {}) {
    switch (name) {
      case 'get_budget_status': {
        const status = budget.status();
        return { spent: formatDollars(status.spentMicros), cap: formatDollars(status.capMicros), state: status.state };
      }
      case 'list_pending_approvals':
        return ledger.list({ status: 'proposed', limit: 20 }).map(summarize);
      case 'list_recent_actions':
        return ledger.list({ limit: Math.min(20, Math.max(1, Number(input.limit) || 10)) }).map(summarize);
      case 'list_autonomy_levels':
        return gate.list().map((policy) => ({ actionType: policy.actionType, level: policy.level, ceiling: policy.ceiling }));
      case 'get_system_status':
        return { paused: settings.get('os.paused') };
      case 'search_live':
        if (!liveSearch) return { error: 'Live search is not configured (set XAI_API_KEY).' };
        return liveSearch.search({ query: String(input.query ?? ''), sources: input.sources });
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  async function ask(question) {
    const messages = [{ role: 'user', content: String(question) }];
    for (let step = 0; step < maxSteps; step += 1) {
      const response = await router.run('chat', { system: CHAT_SYSTEM, messages, tools, maxTokens: 4000 });
      if (response.stopReason === 'refusal') return 'I can’t help with that one.';
      if (response.stopReason !== 'tool_use') return response.text.trim() || 'I don’t have an answer for that yet.';
      messages.push({ role: 'assistant', content: response.content });
      const results = response.content
        .filter((block) => block.type === 'tool_use')
        .map(async (block) => ({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await runTool(block.name, block.input)) }));
      messages.push({ role: 'user', content: await Promise.all(results) });
    }
    return 'I ran out of steps on that one. Try a narrower question.';
  }

  return { ask, runTool };
}
