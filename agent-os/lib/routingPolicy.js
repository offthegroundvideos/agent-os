const ALWAYS_LOCAL_AGENTS = new Set([
  'maya',
  'jordan',
  'sam',
  'luna',
  'iris',
  'rex',
  'nova',
  'pixel',
]);

const LOCAL_OPERATION_KEYWORDS = [
  'show', 'open', 'status', 'refresh', 'list', 'view', 'summarize', 'explain',
  'content calendar', 'publish queue', 'publish ops', 'funnel', 'landing page',
  'ghl', 'workflow controls', 'processes', 'chapters', 'learn', 'comms',
  'kpi', 'mission control', 'panel', 'ui',
];

const CODING_DISPATCH_KEYWORDS = [
  'implement', 'fix', 'build', 'wire', 'integrate', 'refactor', 'patch',
  'debug', 'add', 'create route', 'update component', 'write code', 'coding task',
  'deerflow', 'codex', 'automatic coding teammate',
];

const RESEARCH_DISPATCH_KEYWORDS = [
  'research', 'investigate', 'analyze', 'deep research', 'compare', 'crawl',
  'trend', 'trending', 'discover', 'find patterns', 'map the market', 'competitor',
  'what is working', 'what is going viral', 'firecrawl', 'crawl4ai',
];

function includesKeyword(message = '', keywords = []) {
  const lower = String(message || '').toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function looksOperational(message = '') {
  return includesKeyword(message, LOCAL_OPERATION_KEYWORDS);
}

function looksDeepResearch(message = '') {
  const trimmed = String(message || '').trim();
  return includesKeyword(trimmed, RESEARCH_DISPATCH_KEYWORDS) || trimmed.length > 140;
}

function looksCodingTask(message = '') {
  return includesKeyword(message, CODING_DISPATCH_KEYWORDS);
}

export function getRoutingDecision({ agentId = '', message = '', routeType = 'chat' }) {
  const normalized = String(agentId || '').toLowerCase();

  if (routeType === 'pipeline') {
    return {
      lane: 'agent-os',
      reason: 'Pipelines stay local so handoffs, learning, calendar, publish, and funnel state remain in Agent OS.',
      taskType: 'pipeline',
    };
  }

  if (ALWAYS_LOCAL_AGENTS.has(normalized)) {
    return {
      lane: 'agent-os',
      reason: 'This agent is optimized for business-native workflow execution inside Agent OS.',
      taskType: 'chat',
    };
  }

  if (normalized === 'alex') {
    if (looksOperational(message)) {
      return {
        lane: 'agent-os',
        reason: 'This Alex request is an operational or summary task, so it stays local for speed and business context.',
        taskType: 'chat',
      };
    }
    if (looksDeepResearch(message)) {
      return {
        lane: 'deerflow',
        reason: 'This Alex request looks like deep multi-step research, which is best delegated to DeerFlow.',
        taskType: 'research',
      };
    }
    return {
      lane: 'agent-os',
      reason: 'This Alex request is lightweight enough to stay local.',
      taskType: 'chat',
    };
  }

  if (normalized === 'dev' || normalized === 'cto') {
    if (looksOperational(message)) {
      return {
        lane: 'agent-os',
        reason: 'This technical request is an operational/status task, so it stays in Agent OS.',
        taskType: 'chat',
      };
    }
    if (looksCodingTask(message)) {
      return {
        lane: 'deerflow',
        reason: 'This is a bounded technical implementation task, which is best delegated to DeerFlow.',
        taskType: 'coding',
      };
    }
    return {
      lane: 'agent-os',
      reason: 'This technical request does not clearly require delegated coding.',
      taskType: 'chat',
    };
  }

  if (normalized === 'ceo') {
    return {
      lane: 'agent-os',
      reason: 'Executive decisions stay local because they depend on current business state and operational context.',
      taskType: 'chat',
    };
  }

  return {
    lane: 'agent-os',
    reason: 'Default local execution path.',
    taskType: 'chat',
  };
}

export function getRoutingPolicySummary() {
  return {
    alwaysLocal: [
      'maya',
      'jordan',
      'sam',
      'luna',
      'iris',
      'rex',
      'nova',
      'pixel',
      'ceo',
      'all pipeline runs',
      'publish, funnel, calendar, landing-page, and GHL operations',
    ],
    autoDeerFlow: [
      'alex deep research tasks',
      'dev bounded coding tasks',
      'cto bounded technical implementation or debugging tasks',
    ],
    localFirst: [
      'status checks',
      'panel operations',
      'summaries',
      'client-context-heavy requests',
      'fast lightweight chat work',
    ],
  };
}
