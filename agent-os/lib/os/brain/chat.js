import { formatDollars } from '../budget.js';
import { LANES, STAGES } from '../gigs/constants.js';

const CHANNELS = {
  telegram: 'You are talking with Jack in Telegram on his phone. Answer in a few short sentences.',
  dashboard: 'You are talking with Jack through the OTG-OS dashboard console, like the computer on a ship. Answer in a few short, plain sentences; he may hear your reply read aloud, so avoid tables and markdown. When he asks you to approve, reject, pause or resume something, use propose_decision or propose_control: that only puts a confirm button in front of him, so say it is ready to confirm and never say it is done.',
};

const BASE_SYSTEM = [
  'You are OTG-OS, the operating assistant for OFF THE GROUND (MadeByOTG.com), a photo, video and drone production company based in Fairfax, California, run by Jack Riggs.',
  'Your job is to help book paid shoot days: find prospects, research them, draft pitches for approval, follow up, and sort replies.',
  'You can look things up but cannot approve, send, change or delete anything; for that, point Jack to the Approvals or Settings page, or the Telegram buttons.',
  'Use the tools to look up facts. Never invent numbers, bookings, clients or results; if the tools do not have it, say so plainly.',
  'When asked what needs attention, check today, pending approvals and the pipeline, then say the one or two most useful next steps.',
  'When search_live is available, use it for questions about what is happening now on X or the web, and include the most useful links in your answer.',
];

export function chatSystem(channel = 'telegram') {
  return [BASE_SYSTEM[0], CHANNELS[channel] ?? CHANNELS.telegram, ...BASE_SYSTEM.slice(1)].join(' ');
}

// Kept for callers that read the Telegram prompt directly.
export const CHAT_SYSTEM = chatSystem('telegram');

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

// Read-only views of the dashboard data, available when the runtime passes the dashboard in.
export const INSIGHT_TOOLS = [
  {
    name: 'get_today',
    description: 'Today so far (Pacific): prospects found and researched, pitches drafted, emails, replies, approvals waiting, failed actions, worker health, monthly shoot-day goal and spend.',
    strict: true,
    input_schema: NO_INPUT,
  },
  {
    name: 'list_pipeline',
    description: 'Prospect counts by lane and stage, plus up to 15 prospects filtered by lane and stage. Use stage "open" for active ones, "closed" for closed ones, or "all".',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        lane: { type: 'string', enum: ['all', ...LANES] },
        stage: { type: 'string', enum: ['open', 'closed', 'all', ...STAGES] },
      },
      required: ['lane', 'stage'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_prospect',
    description: 'Everything about one prospect by business name (or part of it): contact, stage, angle, evidence, stage history and the actions taken with their reasons.',
    strict: true,
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
  },
  { name: 'get_worker_log', description: 'The latest lines from the background worker log, oldest first.', strict: true, input_schema: NO_INPUT },
  { name: 'get_settings', description: 'Outreach mode, daily limits, follow-up days, sending window, caps, the monthly goal and which lanes are paused.', strict: true, input_schema: NO_INPUT },
];

const REJECT_REASON_KEYS = ['wrong_target', 'wrong_tone', 'bad_timing', 'other'];

// Dashboard only: these never act. They hand the page a proposal that Jack confirms with a button.
export const PROPOSAL_TOOLS = [
  {
    name: 'propose_decision',
    description: 'Propose approving or rejecting one action that is waiting for approval. target is the business name (or part of it) or the action id. Jack confirms with a button; nothing happens until he does. Use reason "none" when approving.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'reject'] },
        reason: { type: 'string', enum: ['none', ...REJECT_REASON_KEYS] },
      },
      required: ['target', 'decision', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_control',
    description: 'Propose pausing or resuming all outgoing work, or outreach in one lane. Use lane "none" for pause_all and resume_all. Jack confirms with a button.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['pause_all', 'resume_all', 'pause_lane', 'resume_lane'] },
        lane: { type: 'string', enum: ['none', ...LANES] },
      },
      required: ['op', 'lane'],
      additionalProperties: false,
    },
  },
];

const MAX_PROPOSALS = 10;

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

const MAX_HISTORY = 8;
const MAX_TURN_CHARS = 2000;

function summarize(action) {
  return { id: action.id, type: action.actionType, status: action.status, goal: action.why.goal, expected: action.why.expected, created: action.createdAt };
}

const isClosed = (stage) => stage.startsWith('closed_');

export function createChat({ router, ledger, budget, gate, settings, liveSearch = null, dashboard = null, settingsEditor = null, maxSteps = 5 }) {
  const tools = [...CHAT_TOOLS, ...(dashboard ? INSIGHT_TOOLS : []), ...(liveSearch ? [SEARCH_TOOL] : [])];
  const toolsFor = (channel) => (channel === 'dashboard' ? [...tools, ...PROPOSAL_TOOLS] : tools);

  function proposeDecision({ target, decision, reason }, proposals) {
    const wanted = String(target ?? '').trim().toLowerCase();
    if (!wanted) return { error: 'Say which draft: a business name or an action id.' };
    const pending = ledger.list({ status: 'proposed', limit: 100 });
    const matches = pending.filter((action) => action.id.toLowerCase() === wanted)
      .concat(pending.filter((action) => action.id.toLowerCase() !== wanted && String(action.payload?.business ?? '').toLowerCase().includes(wanted)));
    if (!matches.length) {
      return { error: `Nothing waiting matches "${target}".`, waiting: pending.map((action) => action.payload?.business || action.actionType) };
    }
    if (matches.length > 1) return { error: 'More than one draft matches; ask Jack which one.', matches: matches.map((action) => ({ id: action.id, business: action.payload?.business ?? '' })) };
    const [action] = matches;
    const proposal = {
      kind: 'decision', actionId: action.id, decision, reason: decision === 'reject' && REJECT_REASON_KEYS.includes(reason) ? reason : decision === 'reject' ? 'other' : null,
      actionType: action.actionType, business: action.payload?.business ?? '', subject: action.payload?.subject ?? '',
    };
    if (proposals.length < MAX_PROPOSALS && !proposals.some((item) => item.kind === 'decision' && item.actionId === action.id)) proposals.push(proposal);
    return { proposed: true, waitingForJack: true, business: proposal.business, decision };
  }

  function proposeControl({ op, lane }, proposals) {
    const needsLane = op === 'pause_lane' || op === 'resume_lane';
    if (needsLane && !LANES.includes(lane)) return { error: `Pick a lane: ${LANES.join(', ')}` };
    const proposal = { kind: 'control', op, lane: needsLane ? lane : null };
    if (proposals.length < MAX_PROPOSALS && !proposals.some((item) => item.kind === 'control' && item.op === op && item.lane === proposal.lane)) proposals.push(proposal);
    return { proposed: true, waitingForJack: true, op, lane: proposal.lane };
  }

  function today() {
    const view = dashboard.today();
    return {
      summary: view.summary,
      day: view.day,
      waitingForApproval: view.waiting,
      failedActions: view.failed,
      failures: (view.failedActions ?? []).map((action) => ({ type: action.actionType, business: action.business, error: action.lastError })),
      hotLeads: (view.hot ?? []).map((opp) => ({ name: opp.business, stage: opp.stage, lane: opp.lane, updated: opp.updatedAt })),
      paused: view.paused,
      outreachMode: view.mode,
      pausedLanes: view.pausedLanes,
      goal: { bookedShootDays: view.goal.booked, target: view.goal.target },
      spend: { spent: formatDollars(view.spend.spentMicros), cap: formatDollars(view.spend.capMicros), state: view.spend.state },
      worker: { alive: view.worker.alive, lastHeartbeat: view.worker.heartbeatAt, lastLog: view.worker.line?.message ?? null },
    };
  }

  function pipeline({ lane = 'all', stage = 'open' } = {}) {
    const board = dashboard.pipeline();
    const prospects = board.opportunities
      .filter((opp) => (lane === 'all' || opp.lane === lane)
        && (stage === 'all' || (stage === 'open' ? !isClosed(opp.stage) : stage === 'closed' ? isClosed(opp.stage) : opp.stage === stage)))
      .slice(0, 15)
      .map((opp) => ({ name: opp.business, lane: opp.lane, stage: opp.stage, location: opp.location, angle: opp.angle, contact: opp.contactEmail, updated: opp.updatedAt }));
    return { countsByLane: board.counts, pausedLanes: board.pausedLanes, prospects };
  }

  function prospect(name) {
    const ids = dashboard.findOpportunities(name, 3);
    if (!ids.length) return { error: `No prospect matches "${name}".` };
    const opp = dashboard.opportunity(ids[0]);
    return {
      otherMatches: ids.length - 1,
      name: opp.business?.name,
      lane: opp.lane,
      stage: opp.stage,
      location: opp.business?.location,
      website: opp.business?.website,
      fit: opp.business?.fitReason,
      contact: opp.contact ? { name: opp.contact.name, role: opp.contact.role, email: opp.contact.email } : null,
      angle: opp.angle,
      evidence: opp.evidence,
      followUpsSent: opp.followUpsSent,
      nextFollowUpAt: opp.nextFollowUpAt,
      closeReason: opp.closeReason,
      history: opp.events.slice(0, 6).map((event) => ({ to: event.to, reason: event.reason, at: event.at })),
      actions: opp.actions.slice(0, 6).map((action) => ({ type: action.actionType, status: action.status, why: action.why.goal, subject: action.subject })),
      emails: opp.emails.map((email) => ({ kind: email.kind, mode: email.mode, at: email.at })),
      researchBrief: opp.dossier ? {
        summary: opp.dossier.summary,
        likelyNeeds: opp.dossier.likely_needs,
        discoveryQuestions: opp.dossier.discovery_questions,
        interviewQuestions: opp.dossier.interview_questions,
        nextStep: opp.dossier.next_step,
      } : null,
    };
  }

  async function runTool(name, input = {}, { proposals = null } = {}) {
    if (proposals && name === 'propose_decision') return proposeDecision(input, proposals);
    if (proposals && name === 'propose_control') return proposeControl(input, proposals);
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
        break;
    }
    if (!dashboard) return { error: `Unknown tool ${name}` };
    switch (name) {
      case 'get_today':
        return today();
      case 'list_pipeline':
        return pipeline({ lane: input.lane, stage: input.stage });
      case 'get_prospect':
        return prospect(input.name);
      case 'get_worker_log':
        return dashboard.workerLog(14).map((line) => ({ at: line.at, message: line.message }));
      case 'get_settings':
        return { ...(settingsEditor ? settingsEditor.values() : {}), pausedLanes: settings.get('outreach.paused_lanes') };
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  // history: earlier turns of this conversation, [{ role: 'user' | 'assistant', text }], oldest first.
  // taskType 'console' is the dashboard's faster model route; Telegram keeps 'chat'.
  // Returns the answer and any proposals (dashboard only) for Jack to confirm.
  async function converse(question, { channel = 'telegram', history = [], taskType = 'chat' } = {}) {
    const proposals = [];
    const offered = toolsFor(channel);
    const finish = (answer) => ({ answer, proposals: channel === 'dashboard' ? proposals : [] });
    const earlier = (Array.isArray(history) ? history : [])
      .filter((turn) => ['user', 'assistant'].includes(turn?.role) && String(turn.text ?? '').trim())
      .slice(-MAX_HISTORY)
      .map((turn) => ({ role: turn.role, content: String(turn.text).slice(0, MAX_TURN_CHARS) }));
    // The model API wants the conversation to start with the user.
    while (earlier.length && earlier[0].role !== 'user') earlier.shift();
    const messages = [...earlier, { role: 'user', content: String(question) }];
    const system = chatSystem(channel);
    for (let step = 0; step < maxSteps; step += 1) {
      const response = await router.run(taskType, { system, messages, tools: offered, maxTokens: 4000 });
      if (response.stopReason === 'refusal') return finish('I can’t help with that one.');
      if (response.stopReason !== 'tool_use') return finish(response.text.trim() || 'I don’t have an answer for that yet.');
      messages.push({ role: 'assistant', content: response.content });
      const results = response.content
        .filter((block) => block.type === 'tool_use')
        .map(async (block) => {
          let result;
          try {
            result = await runTool(block.name, block.input, { proposals: channel === 'dashboard' ? proposals : null });
          } catch (error) {
            result = { error: String(error?.message ?? error) };
          }
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
        });
      messages.push({ role: 'user', content: await Promise.all(results) });
    }
    return finish('I ran out of steps on that one. Try a narrower question.');
  }

  async function ask(question, options = {}) {
    return (await converse(question, options)).answer;
  }

  return { ask, converse, runTool, tools };
}
