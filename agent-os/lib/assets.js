import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';

const ASSET_FILE = path.join(process.cwd(), 'data', 'assets.json');

export const ASSET_STATES = [
  'idea_created',
  'research_ready',
  'research_approved',
  'script_ready',
  'script_approved',
  'production_ready',
  'edited',
  'final_qa',
  'scheduled',
  'published',
  'performance_reviewed',
  'repurpose_candidate',
  'rejected',
];

export const ALLOWED_TRANSITIONS = {
  idea_created: ['research_ready', 'rejected'],
  research_ready: ['research_approved', 'production_ready', 'script_ready', 'rejected'],
  research_approved: ['script_ready', 'rejected'],
  script_ready: ['script_approved', 'production_ready', 'edited', 'rejected'],
  script_approved: ['production_ready', 'edited', 'rejected'],
  production_ready: ['script_ready', 'edited', 'rejected'],
  edited: ['final_qa', 'rejected'],
  final_qa: ['scheduled', 'rejected'],
  scheduled: ['published', 'rejected'],
  published: ['performance_reviewed'],
  performance_reviewed: ['repurpose_candidate'],
  repurpose_candidate: ['script_ready', 'rejected'],
  rejected: ['idea_created', 'research_ready', 'script_ready', 'production_ready', 'final_qa'],
};

function ensureFile() {
  const dir = path.dirname(ASSET_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ASSET_FILE)) {
    fs.writeFileSync(ASSET_FILE, JSON.stringify({ assets: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(ASSET_FILE, 'utf-8'));
  } catch {
    return { assets: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ASSET_FILE, JSON.stringify(data, null, 2));
}

function buildAssetId(topic = 'asset') {
  return createCanonicalId('content_asset');
}

export function createAsset(input = {}) {
  const data = loadData();
  const systemFields = withSystemFields({}, {
    created_by: input.createdBy || input.owner || 'system',
    source_system: input.sourceSystem || 'agent-os',
  });
  const asset = {
    id: input.id || buildAssetId(input.topic || input.title || 'asset'),
    topic: input.topic || '',
    title: input.title || input.topic || 'Untitled Asset',
    pipelineType: input.pipelineType || 'content',
    state: 'idea_created',
    currentStage: 'idea_created',
    brandProfileId: input.brandProfileId || 'default-brand',
    niche: input.niche || '',
    owner: input.owner || 'human',
    approvals: {
      researchApproved: false,
      scriptApproved: false,
      finalQaApproved: false,
      publishApproved: false,
    },
    outputs: {},
    stageHistory: [{
      state: 'idea_created',
      changedAt: new Date().toISOString(),
      changedBy: input.owner || 'system',
      reason: 'Asset created',
    }],
    openIssues: [],
    qaReviews: [],
    publishMetadata: null,
    ...systemFields,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.assets.unshift(asset);
  saveData(data);
  return asset;
}

export function getAsset(id) {
  const data = loadData();
  return data.assets.find(asset => asset.id === id) || null;
}

export function listAssets() {
  const data = loadData();
  return data.assets.slice().reverse();
}

export function updateAssetOutput(id, stageKey, payload) {
  const data = loadData();
  const asset = data.assets.find(entry => entry.id === id);
  if (!asset) throw new Error('Asset not found');
  asset.outputs[stageKey] = payload;
  asset.version = Number(asset.version || 1) + 1;
  asset.updated_at = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();
  saveData(data);
  return asset;
}

export function setAssetPublishMetadata(id, publishMetadata = {}) {
  const data = loadData();
  const asset = data.assets.find(entry => entry.id === id);
  if (!asset) throw new Error('Asset not found');
  asset.publishMetadata = {
    ...(asset.publishMetadata || {}),
    ...publishMetadata,
    updatedAt: new Date().toISOString(),
  };
  asset.version = Number(asset.version || 1) + 1;
  asset.updated_at = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();
  saveData(data);
  return asset;
}

export function transitionAsset(id, nextState, options = {}) {
  const data = loadData();
  const asset = data.assets.find(entry => entry.id === id);
  if (!asset) throw new Error('Asset not found');

  const allowed = ALLOWED_TRANSITIONS[asset.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`Invalid state transition from ${asset.state} to ${nextState}`);
  }

  if (nextState === 'research_approved' && !asset.approvals.researchApproved) {
    throw new Error('Research approval is required before moving to research_approved');
  }
  if (nextState === 'script_approved' && !asset.approvals.scriptApproved) {
    throw new Error('Script approval is required before moving to script_approved');
  }
  if (nextState === 'scheduled' && !asset.approvals.finalQaApproved) {
    throw new Error('Final QA approval is required before scheduling');
  }
  if (nextState === 'published' && !asset.approvals.publishApproved) {
    throw new Error('Publish approval is required before publishing');
  }

  asset.state = nextState;
  asset.currentStage = nextState;
  asset.version = Number(asset.version || 1) + 1;
  asset.updated_at = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();
  asset.stageHistory.push({
    state: nextState,
    changedAt: new Date().toISOString(),
    changedBy: options.changedBy || 'system',
    reason: options.reason || '',
  });
  if (options.openIssues) asset.openIssues = options.openIssues;
  saveData(data);
  return asset;
}

export function recordApproval(id, approvalKey, approved, options = {}) {
  const data = loadData();
  const asset = data.assets.find(entry => entry.id === id);
  if (!asset) throw new Error('Asset not found');
  if (!(approvalKey in asset.approvals)) throw new Error('Unknown approval key');
  asset.approvals[approvalKey] = !!approved;
  asset.version = Number(asset.version || 1) + 1;
  asset.updated_at = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();
  asset.stageHistory.push({
    state: asset.state,
    changedAt: new Date().toISOString(),
    changedBy: options.changedBy || 'human',
    reason: `${approvalKey}:${approved ? 'approved' : 'rejected'} ${options.reason || ''}`.trim(),
  });
  saveData(data);
  if (approvalKey === 'finalQaApproved' && approved) {
    emitEvent('contentasset.approved', 'content_asset', asset.id, { approvalKey }, { source_system: 'policy_qa' });
  }
  return asset;
}

export function addQaReview(id, review) {
  const data = loadData();
  const asset = data.assets.find(entry => entry.id === id);
  if (!asset) throw new Error('Asset not found');
  asset.qaReviews.push(review);
  asset.version = Number(asset.version || 1) + 1;
  asset.updated_at = new Date().toISOString();
  asset.updatedAt = new Date().toISOString();
  saveData(data);
  return asset;
}
