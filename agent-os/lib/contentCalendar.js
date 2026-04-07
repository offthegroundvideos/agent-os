import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { listScripts } from './contentRecords.js';
import { loadContentOS } from './contentOS.js';
import { listSourceMedia, listClipCandidates } from './mediaIntelligence.js';
import { ensureProductionBundleForCalendarEntry, listProductionBundles } from './productionOps.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'content-calendar.json');
const FOOTAGE_FILE = path.join(process.cwd(), 'data', 'footage', 'library.json');

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ entries: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { entries: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadFootageLibrary() {
  try {
    return JSON.parse(fs.readFileSync(FOOTAGE_FILE, 'utf-8'));
  } catch {
    return { clips: [], collections: [] };
  }
}

function normalizePlatforms(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function tokenize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2);
}

function getTopicMetadata(topic = '') {
  const data = loadContentOS();
  const lower = String(topic || '').toLowerCase();
  const matched = (data.topics || []).find((entry) =>
    `${entry.title} ${entry.contentPillar} ${entry.notes}`.toLowerCase().includes(lower)
  );
  return matched || null;
}

function scoreFootageClip(clip, tokens) {
  const haystack = [
    clip.title,
    clip.description,
    clip.location,
    ...(clip.tags || []),
    ...(clip.categories || []),
  ].join(' ').toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (clip.isStock) score += 0.5;
  if (clip.status === 'edited' || clip.status === 'delivered') score += 0.5;
  return score;
}

function getRecommendedFootage({ topic = '', hookText = '', bodyBullets = [], limit = 3 }) {
  const footageLibrary = loadFootageLibrary();
  const tokens = Array.from(new Set([
    ...tokenize(topic),
    ...tokenize(hookText),
    ...bodyBullets.flatMap((bullet) => tokenize(bullet)),
  ]));

  const clipMatches = (footageLibrary.clips || [])
    .map((clip) => ({ clip, score: scoreFootageClip(clip, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      type: 'library_clip',
      id: entry.clip.id,
      title: entry.clip.title,
      location: entry.clip.location,
      categories: entry.clip.categories || [],
      stock: Boolean(entry.clip.isStock),
      score: Number(entry.score.toFixed(2)),
    }));

  const sourceMediaMatches = listSourceMedia()
    .map((media) => {
      const score = scoreFootageClip({
        title: media.title,
        description: '',
        location: media.location,
        tags: media.tags || [],
        categories: media.categories || [],
        isStock: false,
        status: media.ingest_status,
      }, tokens);
      return { media, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit - clipMatches.length))
    .map((entry) => ({
      type: 'source_media',
      id: entry.media.id,
      title: entry.media.title || entry.media.filename || entry.media.storage_uri,
      location: entry.media.location,
      categories: entry.media.categories || [],
      stock: false,
      score: Number(entry.score.toFixed(2)),
    }));

  return [...clipMatches, ...sourceMediaMatches];
}

function buildFallbackScript(topic = '', mayaHandoff = null) {
  return {
    id: createCanonicalId('script'),
    client_id: mayaHandoff?.outputs?.client_id || 'cli_default',
    campaign_id: mayaHandoff?.outputs?.campaign_id || 'cmp_default',
    topic_brief_id: mayaHandoff?.asset_id || 'tpc_default',
    format: 'talking_head',
    hook_text: mayaHandoff?.summary || topic,
    body_bullets: [mayaHandoff?.summary || `Create a concise post around ${topic}`],
    cta_id: mayaHandoff?.outputs?.cta_id || 'cta_default',
    approval_status: 'draft',
  };
}

function normalizeEntry(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'pipeline',
    source_system: input.source_system || 'content_calendar',
  });
  return {
    id: input.id || createCanonicalId('post_package'),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    asset_id: String(input.asset_id || '').trim(),
    script_id: String(input.script_id || '').trim(),
    title: String(input.title || '').trim(),
    hook_text: String(input.hook_text || '').trim(),
    format: String(input.format || 'talking_head').trim(),
    platforms: normalizePlatforms(input.platforms).length ? normalizePlatforms(input.platforms) : ['instagram', 'tiktok'],
    cta_id: String(input.cta_id || 'cta_default').trim(),
    lane: String(input.lane || 'reach').trim(),
    journey_stage: String(input.journey_stage || 'problem-aware').trim(),
    trend_lane: String(input.trend_lane || 'evergreen').trim(),
    topic: String(input.topic || '').trim(),
    publish_date: String(input.publish_date || '').trim(),
    publish_time: String(input.publish_time || '09:00').trim(),
    status: String(input.status || 'planned').trim(),
    footage_recommendations: Array.isArray(input.footage_recommendations) ? input.footage_recommendations : [],
    handoff_trail: Array.isArray(input.handoff_trail) ? input.handoff_trail : [],
    notes: String(input.notes || '').trim(),
    source_summary: String(input.source_summary || '').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listCalendarEntries(filters = {}) {
  let entries = loadData().entries || [];
  if (filters.asset_id) entries = entries.filter((entry) => entry.asset_id === filters.asset_id);
  if (filters.client_id) entries = entries.filter((entry) => entry.client_id === filters.client_id);
  if (filters.includeProduction) {
    const bundles = listProductionBundles(entries.map((entry) => entry.id));
    entries = entries.map((entry) => ({
      ...entry,
      production_bundle: bundles[entry.id] || null,
    }));
  }
  return entries;
}

export function upsertCalendarEntry(input = {}) {
  const data = loadData();
  const entry = normalizeEntry(input);
  const existingIndex = data.entries.findIndex((item) =>
    item.asset_id === entry.asset_id &&
    item.script_id === entry.script_id &&
    item.publish_date === entry.publish_date &&
    JSON.stringify(item.platforms) === JSON.stringify(entry.platforms)
  );

  if (existingIndex >= 0) {
    data.entries[existingIndex] = {
      ...data.entries[existingIndex],
      ...entry,
      id: data.entries[existingIndex].id,
      updatedAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: Number(data.entries[existingIndex].version || 1) + 1,
    };
    saveData(data);
    try {
      ensureProductionBundleForCalendarEntry(data.entries[existingIndex]);
    } catch {}
    return data.entries[existingIndex];
  }

  data.entries.unshift(entry);
  saveData(data);
  try {
    ensureProductionBundleForCalendarEntry(entry);
  } catch {}
  return entry;
}

export function updateCalendarEntry(entryId, patch = {}) {
  const data = loadData();
  const index = data.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error('Calendar entry not found');

  const existing = data.entries[index];
  data.entries[index] = {
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: Number(existing.version || 1) + 1,
  };
  saveData(data);
  return data.entries[index];
}

export function generateCalendarEntriesForAsset({ assetId, topic, pipelineType, completedSteps = [] }) {
  const mayaHandoff = completedSteps.find((step) => step.agentId === 'maya')?.handoffJson || null;
  const samHandoff = completedSteps.find((step) => step.agentId === 'sam')?.handoffJson || null;
  const topicMeta = getTopicMetadata(topic);
  const scripts = listScripts({ asset_id: assetId });
  const scriptRecords = scripts.length ? scripts : [buildFallbackScript(topic, mayaHandoff)];
  const rawPlatforms =
    samHandoff?.outputs?.platforms ||
    samHandoff?.platforms ||
    ['instagram', 'tiktok'];
  const platforms = normalizePlatforms(rawPlatforms).length ? normalizePlatforms(rawPlatforms) : ['instagram', 'tiktok'];
  const startDate = addDays(new Date(), 1);

  return scriptRecords.map((script, index) => {
    const publishDate = addDays(startDate, index).toISOString().slice(0, 10);
    const handoffTrail = completedSteps.map((step) => ({
      agentId: step.agentId,
      agentName: step.agentName,
      role: step.role,
      summary: step.narrativeSummary || step.handoffJson?.summary || '',
    }));

    return upsertCalendarEntry({
      client_id: script.client_id || mayaHandoff?.outputs?.client_id || 'cli_default',
      campaign_id: script.campaign_id || mayaHandoff?.outputs?.campaign_id || 'cmp_default',
      asset_id: assetId,
      script_id: script.id || '',
      title: script.hook_text || topic,
      hook_text: script.hook_text || topic,
      format: script.format || 'talking_head',
      platforms,
      cta_id: script.cta_id || mayaHandoff?.outputs?.cta_id || 'cta_default',
      lane: topicMeta?.lane || 'reach',
      journey_stage: topicMeta?.journeyStage || 'problem-aware',
      trend_lane: topicMeta?.trendLane || 'evergreen',
      topic,
      publish_date: publishDate,
      publish_time: '09:00',
      status: 'planned',
      footage_recommendations: getRecommendedFootage({
        topic,
        hookText: script.hook_text || topic,
        bodyBullets: script.body_bullets || [],
      }),
      handoff_trail: handoffTrail,
      notes: `Generated from ${pipelineType || 'content'} pipeline.`,
      source_summary: completedSteps.map((step) => `${step.agentName}: ${step.narrativeSummary || ''}`).filter(Boolean).join(' | '),
    });
  });
}
