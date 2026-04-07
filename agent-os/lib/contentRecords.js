import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'content-records.json');

export const SCRIPT_STATES = ['draft', 'qa_review', 'approved', 'production_ready', 'rejected', 'archived'];

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ scripts: [], published_posts: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { scripts: [], published_posts: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalizeScript(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'content_intelligence',
  });
  return {
    id: input.id || createCanonicalId('script'),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    topic_brief_id: String(input.topic_brief_id || 'tpc_default').trim(),
    format: String(input.format || 'talking_head').trim(),
    hook_text: String(input.hook_text || '').trim(),
    body_bullets: Array.isArray(input.body_bullets) ? input.body_bullets : [],
    cta_id: String(input.cta_id || 'cta_default').trim(),
    approval_status: String(input.approval_status || 'draft').trim(),
    asset_id: String(input.asset_id || '').trim(),
    agent_id: String(input.agent_id || 'maya').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizePublishedPost(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'publishing_gateway',
  });
  return {
    id: input.id || createCanonicalId('published_post'),
    content_asset_id: String(input.content_asset_id || input.contentAssetId || '').trim(),
    client_id: String(input.client_id || 'cli_default').trim(),
    platform: String(input.platform || 'instagram').trim(),
    publish_method: String(input.publish_method || '').trim(),
    adapter_mode: String(input.adapter_mode || '').trim(),
    platform_payload: input.platform_payload || null,
    platform_post_id: String(input.platform_post_id || '').trim(),
    post_url: String(input.post_url || '').trim(),
    cta_id: String(input.cta_id || 'cta_default').trim(),
    landing_page_id: String(input.landing_page_id || 'lpg_default').trim(),
    published_at: input.published_at || new Date().toISOString(),
    status: String(input.status || 'published').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listScripts(filters = {}) {
  let scripts = loadData().scripts;
  if (filters.asset_id) scripts = scripts.filter((script) => script.asset_id === filters.asset_id);
  if (filters.client_id) scripts = scripts.filter((script) => script.client_id === filters.client_id);
  return scripts;
}

export function addScript(input = {}) {
  const data = loadData();
  const script = normalizeScript(input);
  data.scripts.unshift(script);
  saveData(data);
  emitEvent('script.created', 'script', script.id, { asset_id: script.asset_id, approval_status: script.approval_status }, {
    source_system: script.source_system,
  });
  if (script.approval_status === 'approved') {
    emitEvent('script.approved', 'script', script.id, { asset_id: script.asset_id }, {
      source_system: script.source_system,
    });
  }
  return script;
}

export function updateScriptStatus(id, approvalStatus, options = {}) {
  const data = loadData();
  const script = data.scripts.find((entry) => entry.id === id);
  if (!script) throw new Error('Script not found');
  if (!SCRIPT_STATES.includes(approvalStatus)) throw new Error('Invalid script status');
  script.approval_status = approvalStatus;
  script.version = Number(script.version || 1) + 1;
  script.updated_at = new Date().toISOString();
  script.updatedAt = new Date().toISOString();
  saveData(data);
  if (approvalStatus === 'approved') {
    emitEvent('script.approved', 'script', script.id, { asset_id: script.asset_id }, {
      source_system: options.source_system || 'policy_qa',
    });
  }
  return script;
}

export function listPublishedPosts(filters = {}) {
  let posts = loadData().published_posts;
  if (filters.content_asset_id) posts = posts.filter((post) => post.content_asset_id === filters.content_asset_id);
  if (filters.client_id) posts = posts.filter((post) => post.client_id === filters.client_id);
  if (filters.platform) posts = posts.filter((post) => post.platform === filters.platform);
  return posts;
}

export function addPublishedPost(input = {}) {
  const data = loadData();
  const post = normalizePublishedPost(input);
  data.published_posts.unshift(post);
  saveData(data);
  emitEvent('post.published', 'published_post', post.id, { content_asset_id: post.content_asset_id, platform: post.platform }, {
    source_system: post.source_system,
  });
  return post;
}

export function upsertPublishedPost(input = {}) {
  const data = loadData();
  const existing = data.published_posts.find((post) => {
    if (input.id && post.id === input.id) return true;
    if (input.platform_post_id && post.platform_post_id === input.platform_post_id) return true;
    return post.content_asset_id === String(input.content_asset_id || input.contentAssetId || '').trim()
      && post.platform === String(input.platform || 'instagram').trim();
  });

  if (existing) {
    existing.publish_method = String(input.publish_method || existing.publish_method || '').trim();
    existing.adapter_mode = String(input.adapter_mode || existing.adapter_mode || '').trim();
    existing.platform_payload = input.platform_payload || existing.platform_payload || null;
    existing.platform_post_id = String(input.platform_post_id || existing.platform_post_id || '').trim();
    existing.post_url = String(input.post_url || existing.post_url || '').trim();
    existing.cta_id = String(input.cta_id || existing.cta_id || 'cta_default').trim();
    existing.landing_page_id = String(input.landing_page_id || existing.landing_page_id || 'lpg_default').trim();
    existing.status = String(input.status || existing.status || 'published').trim();
    existing.published_at = input.published_at || existing.published_at || new Date().toISOString();
    existing.version = Number(existing.version || 1) + 1;
    existing.updated_at = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();
    saveData(data);
    return existing;
  }

  const post = normalizePublishedPost(input);
  data.published_posts.unshift(post);
  saveData(data);
  emitEvent('post.published', 'published_post', post.id, { content_asset_id: post.content_asset_id, platform: post.platform }, {
    source_system: post.source_system,
  });
  return post;
}
