import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'content-os.json');

export const CONTENT_LANES = ['reach', 'trust', 'conversion', 'retention', 'proof'];
export const JOURNEY_STAGES = ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'ready-to-buy'];
export const BACKLOG_STATUSES = ['idea_backlog', 'ready_queue', 'production_queue', 'published', 'archived'];
export const CLAIM_TYPES = ['approved', 'unverified', 'forbidden'];
export const TREND_LANES = ['evergreen', 'trend-reactive'];
export const EDIT_TIERS = ['basic', 'medium', 'advanced'];

const DEFAULT_STATE = {
  strategy: {
    brandName: 'OTG Icon',
    contentThesis: 'OTG helps business owners use short-form video to get more leads through better hooks, clearer offers, and practical content systems.',
    knownFor: 'Actionable short-form growth systems that turn attention into qualified leads.',
    beliefs: [
      'Hook first, script second, format third, editing fourth.',
      'Actionable value beats inspiration and fluff.',
      'Proof and real experience make content heavier.',
      'Broad hooks should lead into narrow value and niche CTA.',
    ],
    audiencePain: [
      'Business owners post content but do not generate consistent leads.',
      'Most short-form videos are vague, over-edited, or disconnected from the offer.',
    ],
    outcomes: [
      'More qualified leads from short-form content.',
      'Clearer offers and stronger positioning.',
      'Repeatable content production that compounds.',
    ],
    trendSplit: { evergreen: 70, trendReactive: 30 },
    portfolioTargets: { reach: 30, trust: 25, conversion: 20, retention: 10, proof: 15 },
    brandVoice: {
      saysOften: ['hook', 'offer', 'qualified leads', 'specific value', 'no fluff'],
      neverSays: ['just stay consistent', 'post and pray', 'secret hack', 'guaranteed clients'],
      bluntness: 'high',
      humor: 'low',
      authority: 'high',
      conversation: 'medium',
      premiumSignals: ['specific proof', 'clean language', 'calm confidence', 'practical examples'],
      rhythm: 'short, direct, punchy sentences',
    },
    platformRules: {
      tiktok: 'Aggressive first-line pattern interrupt, direct camera energy, fast pacing.',
      instagram: 'Strong first frame, readable captions, slightly cleaner polish, CTA in caption and on-screen.',
      youtubeShorts: 'Clear framing, hook by second one, payoff slightly slower than TikTok, strong title packaging.',
      linkedin: 'Turn the same idea into a sharper business lesson with more context and lighter CTA.',
      x: 'Expand winning ideas into threads with a stronger argument spine and one takeaway per post.',
    },
    creativeConstraints: [
      'Max one idea per video.',
      'Max one CTA per video.',
      'No jargon in the first sentence.',
      'Start value immediately after the hook.',
      'Use at least one concrete example.',
      'First frame cannot be a boring wide shot.',
      'Captions should stay tight and readable.',
    ],
    budgets: {
      researchBatchHours: 2,
      firstScriptDraftMinutes: 20,
      maxScriptRevisionRounds: 2,
      basicEditMinutes: 30,
      publishDelayHours: 24,
    },
    moat: [
      'Original field experience with local businesses and creative services.',
      'Own footage library and production capability.',
      'Real offer strategy and sales workflow knowledge.',
      'First-party lessons from wins, losses, and client objections.',
    ],
    qualifiedLeadDefinition: 'A qualified lead matches the target niche, wants a relevant OTG service, has believable budget/timeline, and is willing to move into the funnel.',
    approvedHumanReviewPoints: [
      'Brand profile changes',
      'Research approval',
      'Final script approval',
      'Final QA before publish',
      'Funnel copy or automation changes',
    ],
    continuityRules: [
      'Content problems should match the problems solved in the offer.',
      'Video language should match the landing page and CTA copy.',
      'The CTA should match the real next step in the funnel.',
      'Proof used in content should directly support the sales promise.',
    ],
    capacityMode: {
      current: 'high',
      highCapacityPlan: [
        'Batch 15 talking-head videos.',
        'Film custom B-roll and stronger first-frame hooks.',
        'Record deeper case studies and proof content.',
      ],
      lowCapacityPlan: [
        'Use whiteboard or paper reveal formats.',
        'Use commentary over existing footage.',
        'Repurpose proven winners into lower-lift variations.',
        'Prioritize proof and objection content that is fast to produce.',
      ],
      currentConstraints: [
        'Default to the simplest format that still preserves performance.',
      ],
    },
  },
  offers: [],
  proofLibrary: [],
  claimRegistry: [],
  negativePatterns: [],
  experiments: [],
  topics: [],
  leadFeedback: [],
  objections: [],
  productionReality: [],
  antiFluff: [],
  postmortems: [],
  lastUpdated: null,
};

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min = 0, max = 10) {
  return Math.max(min, Math.min(max, toNumber(value)));
}

function normalizeOffer(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('offer'),
    client_id: String(input.client_id || input.clientId || 'cli_default').trim(),
    name: String(input.name || '').trim(),
    category: String(input.category || 'service').trim(),
    price_floor: toNumber(input.price_floor ?? input.priceFloor, 0),
    primary_outcome: String(input.primary_outcome || input.primaryOutcome || '').trim(),
    qualified_lead_definition: {
      persona_match: input.qualified_lead_definition?.persona_match ?? input.qualifiedLeadDefinition?.persona_match ?? true,
      budget_min: toNumber(input.qualified_lead_definition?.budget_min ?? input.qualifiedLeadDefinition?.budget_min, 0),
      urgency_window_days: toNumber(input.qualified_lead_definition?.urgency_window_days ?? input.qualifiedLeadDefinition?.urgency_window_days, 30),
    },
    service: String(input.service || '').trim(),
    leadMagnet: String(input.leadMagnet || '').trim(),
    customerProblem: String(input.customerProblem || '').trim(),
    ctaPath: String(input.ctaPath || '').trim(),
    contentPillar: String(input.contentPillar || '').trim(),
    landingPageLanguage: String(input.landingPageLanguage || '').trim(),
    salesPromise: String(input.salesPromise || '').trim(),
    continuityNotes: String(input.continuityNotes || '').trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProof(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('proof_asset'),
    title: String(input.title || '').trim(),
    proofType: String(input.proofType || 'case-study').trim(),
    summary: String(input.summary || '').trim(),
    metric: String(input.metric || '').trim(),
    source: String(input.source || '').trim(),
    story: String(input.story || '').trim(),
    tags: asArray(input.tags),
    usableClaims: asArray(input.usableClaims),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeClaim(input = {}) {
  const claimType = CLAIM_TYPES.includes(input.claimType) ? input.claimType : 'unverified';
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('claim_rule'),
    claim: String(input.claim || '').trim(),
    claimType,
    evidence: String(input.evidence || '').trim(),
    saferVersion: String(input.saferVersion || '').trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeNegativePattern(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('recommendation'),
    pattern: String(input.pattern || '').trim(),
    category: String(input.category || 'general').trim(),
    whyItFails: String(input.whyItFails || '').trim(),
    avoidRule: String(input.avoidRule || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeExperiment(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('recommendation'),
    name: String(input.name || '').trim(),
    variable: String(input.variable || '').trim(),
    constant: String(input.constant || '').trim(),
    reps: Math.max(1, toNumber(input.reps, 3)),
    winnerMetric: String(input.winnerMetric || '').trim(),
    scaleThreshold: String(input.scaleThreshold || '').trim(),
    notes: String(input.notes || '').trim(),
    status: String(input.status || 'planned').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTopic(input = {}) {
  const scores = {
    audiencePain: clamp(input.audiencePain),
    offerRelevance: clamp(input.offerRelevance),
    proofAvailability: clamp(input.proofAvailability),
    easeOfFilming: clamp(input.easeOfFilming),
    shareSavePotential: clamp(input.shareSavePotential),
    qualifiedLeadPotential: clamp(input.qualifiedLeadPotential),
    freshness: clamp(input.freshness),
    repeatability: clamp(input.repeatability),
  };
  const weightedScore = scoreTopic(scores);
  const productionLift = String(input.productionLift || 'medium').trim();
  const onCameraIntensity = String(input.onCameraIntensity || 'medium').trim();
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('topic_brief'),
    title: String(input.title || '').trim(),
    contentPillar: String(input.contentPillar || '').trim(),
    lane: CONTENT_LANES.includes(input.lane) ? input.lane : 'reach',
    journeyStage: JOURNEY_STAGES.includes(input.journeyStage) ? input.journeyStage : 'problem-aware',
    trendLane: TREND_LANES.includes(input.trendLane) ? input.trendLane : 'evergreen',
    linkedOfferId: String(input.linkedOfferId || '').trim(),
    owner: String(input.owner || 'system').trim(),
    dueDate: String(input.dueDate || '').trim(),
    priority: String(input.priority || 'medium').trim(),
    status: BACKLOG_STATUSES.includes(input.status) ? input.status : 'idea_backlog',
    notes: String(input.notes || '').trim(),
    productionLift: ['low', 'medium', 'high'].includes(productionLift) ? productionLift : 'medium',
    repurposeReady: Boolean(input.repurposeReady),
    onCameraIntensity: ['low', 'medium', 'high'].includes(onCameraIntensity) ? onCameraIntensity : 'medium',
    formatBias: String(input.formatBias || '').trim(),
    scores,
    weightedScore,
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLeadFeedback(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('lead'),
    sourcePost: String(input.sourcePost || '').trim(),
    hook: String(input.hook || '').trim(),
    cta: String(input.cta || '').trim(),
    offerWanted: String(input.offerWanted || '').trim(),
    qualified: Boolean(input.qualified),
    booked: Boolean(input.booked),
    bought: Boolean(input.bought),
    dealSize: toNumber(input.dealSize),
    decisionReason: String(input.decisionReason || '').trim(),
    fitNotes: String(input.fitNotes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeObjection(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('objection'),
    objection: String(input.objection || '').trim(),
    source: String(input.source || '').trim(),
    responseAngle: String(input.responseAngle || '').trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeProductionReality(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('event_log'),
    category: String(input.category || 'production').trim(),
    finding: String(input.finding || '').trim(),
    implication: String(input.implication || '').trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAntiFluff(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('recommendation'),
    myth: String(input.myth || '').trim(),
    whyWrong: String(input.whyWrong || '').trim(),
    replacement: String(input.replacement || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizePostmortem(input = {}) {
  const systemFields = withSystemFields(input, { created_by: input.created_by || 'human', source_system: input.source_system || 'agent-os' });
  return {
    id: input.id || createCanonicalId('event_log'),
    reviewType: String(input.reviewType || 'postmortem').trim(),
    assetId: String(input.assetId || '').trim(),
    title: String(input.title || '').trim(),
    findings: asArray(input.findings),
    actions: asArray(input.actions),
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function loadContentOS() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return {
      ...cloneDefaultState(),
      ...parsed,
      strategy: {
        ...cloneDefaultState().strategy,
        ...(parsed.strategy || {}),
      },
    };
  } catch {
    return cloneDefaultState();
  }
}

export function saveContentOS(data) {
  ensureDataFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  return data;
}

export function updateStrategy(patch = {}) {
  const data = loadContentOS();
  data.strategy = {
    ...data.strategy,
    ...patch,
    beliefs: patch.beliefs !== undefined ? asArray(patch.beliefs) : data.strategy.beliefs,
    audiencePain: patch.audiencePain !== undefined ? asArray(patch.audiencePain) : data.strategy.audiencePain,
    outcomes: patch.outcomes !== undefined ? asArray(patch.outcomes) : data.strategy.outcomes,
    creativeConstraints: patch.creativeConstraints !== undefined ? asArray(patch.creativeConstraints) : data.strategy.creativeConstraints,
    moat: patch.moat !== undefined ? asArray(patch.moat) : data.strategy.moat,
    approvedHumanReviewPoints: patch.approvedHumanReviewPoints !== undefined ? asArray(patch.approvedHumanReviewPoints) : data.strategy.approvedHumanReviewPoints,
    continuityRules: patch.continuityRules !== undefined ? asArray(patch.continuityRules) : data.strategy.continuityRules,
    brandVoice: {
      ...data.strategy.brandVoice,
      ...(patch.brandVoice || {}),
      saysOften: patch.brandVoice?.saysOften !== undefined ? asArray(patch.brandVoice.saysOften) : data.strategy.brandVoice.saysOften,
      neverSays: patch.brandVoice?.neverSays !== undefined ? asArray(patch.brandVoice.neverSays) : data.strategy.brandVoice.neverSays,
      premiumSignals: patch.brandVoice?.premiumSignals !== undefined ? asArray(patch.brandVoice.premiumSignals) : data.strategy.brandVoice.premiumSignals,
    },
    platformRules: {
      ...data.strategy.platformRules,
      ...(patch.platformRules || {}),
    },
    trendSplit: {
      ...data.strategy.trendSplit,
      ...(patch.trendSplit || {}),
    },
    portfolioTargets: {
      ...data.strategy.portfolioTargets,
      ...(patch.portfolioTargets || {}),
    },
    budgets: {
      ...data.strategy.budgets,
      ...(patch.budgets || {}),
    },
    capacityMode: {
      ...data.strategy.capacityMode,
      ...(patch.capacityMode || {}),
      highCapacityPlan: patch.capacityMode?.highCapacityPlan !== undefined ? asArray(patch.capacityMode.highCapacityPlan) : data.strategy.capacityMode.highCapacityPlan,
      lowCapacityPlan: patch.capacityMode?.lowCapacityPlan !== undefined ? asArray(patch.capacityMode.lowCapacityPlan) : data.strategy.capacityMode.lowCapacityPlan,
      currentConstraints: patch.capacityMode?.currentConstraints !== undefined ? asArray(patch.capacityMode.currentConstraints) : data.strategy.capacityMode.currentConstraints,
    },
  };
  saveContentOS(data);
  return data.strategy;
}

function prependItem(list, item, dedupeKey) {
  const filtered = dedupeKey ? list.filter((existing) => existing[dedupeKey] !== item[dedupeKey]) : list;
  filtered.unshift(item);
  return filtered.slice(0, 200);
}

export function addOffer(input) {
  const data = loadContentOS();
  const offer = normalizeOffer(input);
  data.offers = prependItem(data.offers, offer, 'id');
  saveContentOS(data);
  emitEvent('offer.updated', 'offer', offer.id, { name: offer.name, client_id: offer.client_id }, { source_system: 'client_intelligence' });
  return offer;
}

export function addProof(input) {
  const data = loadContentOS();
  const proof = normalizeProof(input);
  data.proofLibrary = prependItem(data.proofLibrary, proof, 'id');
  saveContentOS(data);
  return proof;
}

export function addClaim(input) {
  const data = loadContentOS();
  const claim = normalizeClaim(input);
  data.claimRegistry = prependItem(data.claimRegistry, claim, 'id');
  saveContentOS(data);
  return claim;
}

export function addNegativePattern(input) {
  const data = loadContentOS();
  const pattern = normalizeNegativePattern(input);
  data.negativePatterns = prependItem(data.negativePatterns, pattern, 'id');
  saveContentOS(data);
  return pattern;
}

export function addExperiment(input) {
  const data = loadContentOS();
  const experiment = normalizeExperiment(input);
  data.experiments = prependItem(data.experiments, experiment, 'id');
  saveContentOS(data);
  return experiment;
}

export function addTopic(input) {
  const data = loadContentOS();
  const topic = normalizeTopic(input);
  data.topics = prependItem(data.topics, topic, 'id');
  saveContentOS(data);
  return topic;
}

export function addLeadFeedback(input) {
  const data = loadContentOS();
  const lead = normalizeLeadFeedback(input);
  data.leadFeedback = prependItem(data.leadFeedback, lead, 'id');
  saveContentOS(data);
  return lead;
}

export function addObjection(input) {
  const data = loadContentOS();
  const objection = normalizeObjection(input);
  data.objections = prependItem(data.objections, objection, 'id');
  saveContentOS(data);
  return objection;
}

export function addProductionReality(input) {
  const data = loadContentOS();
  const entry = normalizeProductionReality(input);
  data.productionReality = prependItem(data.productionReality, entry, 'id');
  saveContentOS(data);
  return entry;
}

export function addAntiFluff(input) {
  const data = loadContentOS();
  const entry = normalizeAntiFluff(input);
  data.antiFluff = prependItem(data.antiFluff, entry, 'id');
  saveContentOS(data);
  return entry;
}

export function addPostmortem(input) {
  const data = loadContentOS();
  const entry = normalizePostmortem(input);
  data.postmortems = prependItem(data.postmortems, entry, 'id');
  saveContentOS(data);
  return entry;
}

export function scoreTopic(scores = {}) {
  const weighted =
    clamp(scores.audiencePain) * 0.17 +
    clamp(scores.offerRelevance) * 0.18 +
    clamp(scores.proofAvailability) * 0.12 +
    clamp(scores.easeOfFilming) * 0.08 +
    clamp(scores.shareSavePotential) * 0.14 +
    clamp(scores.qualifiedLeadPotential) * 0.18 +
    clamp(scores.freshness) * 0.06 +
    clamp(scores.repeatability) * 0.07;
  return Number(weighted.toFixed(2));
}

export function generateSeriesVariants(title = '') {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return [];
  return [
    `Myth version: The lie behind "${cleanTitle}"`,
    `Mistake version: 3 mistakes people make with "${cleanTitle}"`,
    `Checklist version: A quick checklist for "${cleanTitle}"`,
    `Case study version: What happened when we used "${cleanTitle}" in real work`,
    `Beginner version: Start here if "${cleanTitle}" is new to you`,
    `Advanced version: The advanced move most people miss in "${cleanTitle}"`,
    `Objection version: "Will ${cleanTitle} even work for me?"`,
    `Industry-specific version: "${cleanTitle}" for local businesses`,
    `Story version: The hard lesson that taught us "${cleanTitle}"`,
  ];
}

export function getPortfolioBalance() {
  const data = loadContentOS();
  const totals = Object.fromEntries(CONTENT_LANES.map((lane) => [lane, 0]));
  const activeTopics = data.topics.filter((topic) => topic.status !== 'archived');
  activeTopics.forEach((topic) => {
    totals[topic.lane] = (totals[topic.lane] || 0) + 1;
  });
  return CONTENT_LANES.map((lane) => ({
    lane,
    target: data.strategy.portfolioTargets[lane] || 0,
    currentCount: totals[lane] || 0,
  }));
}

function getLiftAdjustment(topic, capacityMode = 'high') {
  if (capacityMode !== 'low') return 0;
  let adjustment = 0;
  if (topic.productionLift === 'low') adjustment += 1.2;
  if (topic.productionLift === 'medium') adjustment += 0.2;
  if (topic.productionLift === 'high') adjustment -= 1.5;
  if (topic.repurposeReady) adjustment += 1.1;
  if (topic.onCameraIntensity === 'low') adjustment += 0.8;
  if (topic.onCameraIntensity === 'high') adjustment -= 0.9;
  return adjustment;
}

export function getRecommendedTopicQueue(limit = 12) {
  const data = loadContentOS();
  const capacityMode = data.strategy.capacityMode?.current || 'high';
  const queueStatuses = new Set(['ready_queue', 'production_queue', 'idea_backlog']);
  return (data.topics || [])
    .filter((topic) => queueStatuses.has(topic.status))
    .map((topic) => ({
      ...topic,
      queueScore: Number((topic.weightedScore + getLiftAdjustment(topic, capacityMode)).toFixed(2)),
      capacityReason: capacityMode === 'low'
        ? `lift=${topic.productionLift}, repurpose=${topic.repurposeReady ? 'yes' : 'no'}, on-camera=${topic.onCameraIntensity}`
        : `base score=${topic.weightedScore}`,
    }))
    .sort((a, b) =>
      b.queueScore - a.queueScore ||
      (a.status === 'production_queue' ? 1 : 0) - (b.status === 'production_queue' ? 1 : 0) ||
      b.weightedScore - a.weightedScore
    )
    .slice(0, limit);
}

export function getLeadQualitySummary() {
  const data = loadContentOS();
  const total = data.leadFeedback.length;
  const qualified = data.leadFeedback.filter((lead) => lead.qualified).length;
  const booked = data.leadFeedback.filter((lead) => lead.booked).length;
  const bought = data.leadFeedback.filter((lead) => lead.bought).length;
  const revenue = data.leadFeedback.reduce((sum, lead) => sum + (lead.bought ? lead.dealSize || 0 : 0), 0);
  return {
    totalLeads: total,
    qualifiedRate: total ? Number(((qualified / total) * 100).toFixed(1)) : 0,
    bookedRate: total ? Number(((booked / total) * 100).toFixed(1)) : 0,
    closeRate: total ? Number(((bought / total) * 100).toFixed(1)) : 0,
    totalRevenue: revenue,
  };
}

export function getContentOSSummary() {
  const data = loadContentOS();
  const approvedClaims = data.claimRegistry.filter((claim) => claim.claimType === 'approved').length;
  const forbiddenClaims = data.claimRegistry.filter((claim) => claim.claimType === 'forbidden').length;
  return {
    contentThesis: data.strategy.contentThesis,
    offerCount: data.offers.length,
    proofCount: data.proofLibrary.length,
    claimCounts: {
      approved: approvedClaims,
      forbidden: forbiddenClaims,
      unverified: data.claimRegistry.length - approvedClaims - forbiddenClaims,
    },
    negativePatternCount: data.negativePatterns.length,
    experimentCount: data.experiments.length,
    topicCount: data.topics.length,
    readyQueueCount: data.topics.filter((topic) => topic.status === 'ready_queue').length,
    productionQueueCount: data.topics.filter((topic) => topic.status === 'production_queue').length,
    capacityMode: data.strategy.capacityMode?.current || 'high',
    portfolioBalance: getPortfolioBalance(),
    recommendedQueue: getRecommendedTopicQueue(8),
    leadQuality: getLeadQualitySummary(),
    lastUpdated: data.lastUpdated,
  };
}

function pickRelevant(entries, query, fields) {
  if (!query) return entries.slice(0, 5);
  const lower = query.toLowerCase();
  return entries.filter((entry) =>
    fields.some((field) => String(entry[field] || '').toLowerCase().includes(lower))
  ).slice(0, 5);
}

export function buildContentOSContext(task = '', agentId = '') {
  const data = loadContentOS();
  const query = String(task || '').toLowerCase();
  const relevantOffers = pickRelevant(data.offers, query, ['name', 'service', 'customerProblem', 'contentPillar']);
  const relevantProof = pickRelevant(data.proofLibrary, query, ['title', 'summary', 'story', 'metric']);
  const relevantObjections = pickRelevant(data.objections, query, ['objection', 'responseAngle']);
  const relevantNegativePatterns = pickRelevant(data.negativePatterns, query, ['pattern', 'whyItFails', 'avoidRule']);
  const activeExperiments = data.experiments.filter((experiment) => experiment.status !== 'complete').slice(0, 4);
  const relevantTopics = [...data.topics]
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .filter((topic) => !query || `${topic.title} ${topic.contentPillar} ${topic.notes}`.toLowerCase().includes(query))
    .slice(0, 5);
  const claimSummary = {
    approved: data.claimRegistry.filter((claim) => claim.claimType === 'approved').slice(0, 5),
    forbidden: data.claimRegistry.filter((claim) => claim.claimType === 'forbidden').slice(0, 5),
  };

  const lines = [
    '[CONTENT OS STRATEGY]',
    `THESIS: ${data.strategy.contentThesis}`,
    `KNOWN FOR: ${data.strategy.knownFor}`,
    `AUDIENCE PAIN: ${data.strategy.audiencePain.slice(0, 3).join(' | ')}`,
    `OUTCOMES: ${data.strategy.outcomes.slice(0, 3).join(' | ')}`,
    `QUALIFIED LEAD: ${data.strategy.qualifiedLeadDefinition}`,
    `CAPACITY MODE: ${data.strategy.capacityMode.current}`,
    `TREND SPLIT: evergreen ${data.strategy.trendSplit.evergreen}% / trend-reactive ${data.strategy.trendSplit.trendReactive}%`,
    `VOICE: says ${data.strategy.brandVoice.saysOften.slice(0, 5).join(', ')} | never says ${data.strategy.brandVoice.neverSays.slice(0, 5).join(', ')}`,
    `CONSTRAINTS: ${data.strategy.creativeConstraints.slice(0, 6).join(' | ')}`,
  ];

  if (data.strategy.platformRules?.tiktok || data.strategy.platformRules?.instagram) {
    lines.push(`PLATFORMS: TikTok=${data.strategy.platformRules.tiktok} Instagram=${data.strategy.platformRules.instagram}`);
  }

  if (relevantOffers.length) {
    lines.push('OFFER MAP:');
    relevantOffers.forEach((offer) => {
      lines.push(`- ${offer.name || offer.service}: problem=${offer.customerProblem}; magnet=${offer.leadMagnet}; CTA=${offer.ctaPath}; landing=${offer.landingPageLanguage || 'n/a'}; promise=${offer.salesPromise || 'n/a'}`);
    });
  }

  if (data.strategy.continuityRules?.length) {
    lines.push(`CONTENT TO OFFER CONTINUITY: ${data.strategy.continuityRules.slice(0, 4).join(' | ')}`);
  }

  if (data.strategy.capacityMode?.current === 'low') {
    lines.push(`LOW CAPACITY PLAN: ${(data.strategy.capacityMode.lowCapacityPlan || []).slice(0, 5).join(' | ')}`);
  } else {
    lines.push(`HIGH CAPACITY PLAN: ${(data.strategy.capacityMode.highCapacityPlan || []).slice(0, 5).join(' | ')}`);
  }

  if (data.strategy.capacityMode?.currentConstraints?.length) {
    lines.push(`CURRENT CAPACITY CONSTRAINTS: ${data.strategy.capacityMode.currentConstraints.slice(0, 5).join(' | ')}`);
  }

  if (relevantTopics.length) {
    lines.push('PRIORITY TOPICS:');
    relevantTopics.forEach((topic) => {
      lines.push(`- ${topic.title} [${topic.lane}, ${topic.journeyStage}, ${topic.trendLane}] score=${topic.weightedScore}`);
    });
  }

  if (relevantProof.length) {
    lines.push('PROOF LIBRARY:');
    relevantProof.forEach((proof) => {
      lines.push(`- ${proof.title}: ${proof.summary || proof.story || proof.metric}`);
    });
  }

  if (relevantObjections.length) {
    lines.push('OBJECTIONS TO ADDRESS:');
    relevantObjections.forEach((objection) => {
      lines.push(`- ${objection.objection} -> ${objection.responseAngle}`);
    });
  }

  if (relevantNegativePatterns.length) {
    lines.push('NEGATIVE PATTERNS TO AVOID:');
    relevantNegativePatterns.forEach((pattern) => {
      lines.push(`- ${pattern.pattern} -> ${pattern.avoidRule || pattern.whyItFails}`);
    });
  }

  if (activeExperiments.length) {
    lines.push('ACTIVE EXPERIMENTS:');
    activeExperiments.forEach((experiment) => {
      lines.push(`- ${experiment.name}: test ${experiment.variable}; hold constant ${experiment.constant}; winner metric ${experiment.winnerMetric}`);
    });
  }

  if (claimSummary.approved.length) {
    lines.push('APPROVED CLAIMS:');
    claimSummary.approved.forEach((claim) => {
      lines.push(`- ${claim.claim}`);
    });
  }

  if (claimSummary.forbidden.length) {
    lines.push('FORBIDDEN CLAIMS:');
    claimSummary.forbidden.forEach((claim) => {
      lines.push(`- ${claim.claim}`);
    });
  }

  if (data.productionReality.length) {
    lines.push('PRODUCTION REALITY:');
    data.productionReality.slice(0, 4).forEach((entry) => {
      lines.push(`- ${entry.finding} -> ${entry.implication}`);
    });
  }

  if (data.antiFluff.length) {
    lines.push('WHAT NOT TO DO:');
    data.antiFluff.slice(0, 4).forEach((entry) => {
      lines.push(`- Stop: ${entry.myth} -> Do: ${entry.replacement}`);
    });
  }

  if (agentId === 'maya' || agentId === 'sam') {
    const portfolio = getPortfolioBalance()
      .map((lane) => `${lane.lane}:${lane.currentCount}/${lane.target}`)
      .join(', ');
    lines.push(`CONTENT PORTFOLIO BALANCE: ${portfolio}`);
  }

  lines.push('[END CONTENT OS STRATEGY]');
  return lines.join('\n');
}
