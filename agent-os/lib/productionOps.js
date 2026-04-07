import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';
import { loadContentOS } from './contentOS.js';
import { getAsset, transitionAsset } from './assets.js';
import { updateCalendarEntry } from './contentCalendar.js';
import { ensurePublishJobsForCalendarEntry } from './publishQueue.js';
import { ensureRenderMediaOutputs, getPublicMediaBaseUrl } from './renderMediaStore.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'production-ops.json');
const SHOOT_STATUSES = ['ready_to_shoot', 'shoot_scheduled', 'shot', 'handoff_to_edit', 'archived', 'shoot_blocked'];
const EDIT_STATUSES = ['queued', 'processing', 'rendered', 'qa_review', 'approved', 'published_ready', 'published', 'render_failed', 'qa_failed', 'publish_failed'];
const RENDER_STATUSES = ['queued', 'processing', 'rendered', 'qa_review', 'approved', 'published_ready', 'published', 'render_failed', 'qa_failed', 'publish_failed'];

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ shootSchedules: [], editJobs: [], renderJobs: [], lastUpdated: null }, null, 2)
    );
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { shootSchedules: [], editJobs: [], renderJobs: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function addDays(dateString, days) {
  const next = new Date(dateString || Date.now());
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function formatLabel(value = '') {
  return String(value)
    .replace(/^cta_/, '')
    .replace(/^cmp_/, '')
    .replace(/^cli_/, '')
    .replace(/_/g, ' ')
    .trim();
}

function getCapacityMode() {
  try {
    return loadContentOS().strategy?.capacityMode?.current || 'high';
  } catch {
    return 'high';
  }
}

function targetToPlatform(target = '') {
  const normalized = String(target || '').toLowerCase();
  if (normalized.startsWith('instagram')) return 'instagram';
  if (normalized.startsWith('tiktok')) return 'tiktok';
  if (normalized.startsWith('youtube')) return 'youtube';
  if (normalized.startsWith('linkedin')) return 'linkedin';
  return normalized.split('_')[0] || 'instagram';
}

function isLegacyRenderUrl(value = '') {
  return String(value || '').includes('/api/render-media/');
}

function buildRenderOutputUrls(renderJobId, outputTargets = []) {
  const base = getPublicMediaBaseUrl();
  const urls = {};
  for (const target of outputTargets) {
    const platform = targetToPlatform(target);
    urls[platform] = `${base}/api/render-media/${renderJobId}?platform=${platform}`;
  }
  return urls;
}

function inferEditLane(entry = {}) {
  const hasSourceMedia = (entry.footage_recommendations || []).some((item) => item.type === 'source_media');
  const hasLibraryFootage = (entry.footage_recommendations || []).some((item) => item.type === 'library_clip');
  const format = String(entry.format || '').toLowerCase();

  if (hasSourceMedia && hasLibraryFootage) return 'hybrid';
  if (hasSourceMedia) return 'resolve';
  if (hasLibraryFootage) return 'hybrid';
  if (format.includes('b-roll') || format.includes('faceless')) return 'remotion';
  return 'resolve';
}

function inferEditTier(entry = {}) {
  const lane = String(entry.lane || '').toLowerCase();
  if (lane === 'proof' || lane === 'conversion') return 'medium';
  if (lane === 'reach' && String(entry.trend_lane || '').toLowerCase() === 'trend-reactive') return 'basic';
  return 'basic';
}

function inferShootLocation(entry = {}) {
  const locationMatch = (entry.footage_recommendations || []).find((item) => item.location);
  if (locationMatch?.location) return locationMatch.location;
  if (String(entry.format || '').toLowerCase().includes('whiteboard')) return 'Office whiteboard setup';
  return 'Main camera setup';
}

function inferTalent(entry = {}) {
  if (String(entry.format || '').toLowerCase().includes('podcast')) return ['Founder', 'Guest'];
  if (String(entry.format || '').toLowerCase().includes('b-roll')) return ['Voiceover talent'];
  return ['Founder'];
}

function buildShotRequirements(entry = {}) {
  const requirements = [
    `First frame must support the hook: ${entry.hook_text || entry.title || entry.topic || 'Lead with the core promise.'}`,
    `Keep format locked to ${formatLabel(entry.format || 'talking head')}.`,
    `Deliver one clear idea for ${formatLabel(entry.journey_stage || 'problem aware')} viewers.`,
  ];

  if ((entry.footage_recommendations || []).length) {
    const topPick = entry.footage_recommendations[0];
    requirements.push(`Use ${topPick.title} as the primary supporting visual if live footage is weak.`);
  }

  return requirements;
}

function isCanonicalId(entityName, value) {
  const id = String(value || '').trim();
  if (!id) return false;
  if (entityName === 'shoot_schedule') return id.startsWith('sht_');
  if (entityName === 'edit_job') return id.startsWith('edt_');
  if (entityName === 'render_job') return id.startsWith('rnd_');
  return false;
}

function normalizeShootSchedule(input = {}) {
  const systemFields = withSystemFields({}, {
    version: input.version,
    created_at: input.created_at,
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'production_ops',
  });
  return {
    id: isCanonicalId('shoot_schedule', input.id) ? input.id : createCanonicalId('shoot_schedule'),
    calendar_entry_id: String(input.calendar_entry_id || '').trim(),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    owner: String(input.owner || 'Production lead').trim(),
    shoot_date: String(input.shoot_date || addDays(new Date().toISOString(), 0)).trim(),
    due_date: String(input.due_date || input.shoot_date || addDays(new Date().toISOString(), 0)).trim(),
    location: String(input.location || 'Main camera setup').trim(),
    format: String(input.format || 'talking_head').trim(),
    status: SHOOT_STATUSES.includes(String(input.status || '').trim()) ? String(input.status).trim() : 'ready_to_shoot',
    talent: Array.isArray(input.talent) ? input.talent : inferTalent(input),
    shot_requirements: Array.isArray(input.shot_requirements) ? input.shot_requirements : buildShotRequirements(input),
    first_frame_instruction: String(input.first_frame_instruction || input.hook_text || input.title || '').trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || systemFields.created_at,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeEditJob(input = {}) {
  const systemFields = withSystemFields({}, {
    version: input.version,
    created_at: input.created_at,
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'production_ops',
  });
  return {
    id: isCanonicalId('edit_job', input.id) ? input.id : createCanonicalId('edit_job'),
    calendar_entry_id: String(input.calendar_entry_id || '').trim(),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    content_asset_id: String(input.content_asset_id || input.asset_id || '').trim(),
    edit_lane: String(input.edit_lane || inferEditLane(input)).trim(),
    editor: String(input.editor || 'Unassigned editor').trim(),
    edit_tier: String(input.edit_tier || inferEditTier(input)).trim(),
    caption_style: String(input.caption_style || 'clean readable captions').trim(),
    status: EDIT_STATUSES.includes(String(input.status || '').trim()) ? String(input.status).trim() : 'queued',
    due_date: String(input.due_date || addDays(input.publish_date, -1)).trim(),
    revision_ceiling: Number(input.revision_ceiling || 2),
    source_media_ids: Array.isArray(input.source_media_ids)
      ? input.source_media_ids
      : (input.footage_recommendations || [])
          .filter((item) => item.type === 'source_media')
          .map((item) => item.id),
    footage_ids: Array.isArray(input.footage_ids)
      ? input.footage_ids
      : (input.footage_recommendations || [])
          .filter((item) => item.type === 'library_clip')
          .map((item) => item.id),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || systemFields.created_at,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeRenderJob(input = {}) {
  const systemFields = withSystemFields({}, {
    version: input.version,
    created_at: input.created_at,
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'production_ops',
  });
  const renderId = isCanonicalId('render_job', input.id) ? input.id : createCanonicalId('render_job');
  const outputTargets =
    Array.isArray(input.output_targets) && input.output_targets.length
      ? input.output_targets
      : (input.platforms || ['instagram']).map((platform) => `${platform}_vertical`);
  const outputUrls = buildRenderOutputUrls(renderId, outputTargets);
  const localMedia = ensureRenderMediaOutputs(
    renderId,
    outputTargets.map((target) => targetToPlatform(target))
  );
  const resolvedOutputUrls =
    localMedia.publicOutputUrls && Object.keys(localMedia.publicOutputUrls).length
      ? localMedia.publicOutputUrls
      : outputUrls;
  const publicMediaUrl = resolvedOutputUrls[targetToPlatform(outputTargets[0])] || '';
  return {
    id: renderId,
    edit_job_id: String(input.edit_job_id || '').trim(),
    calendar_entry_id: String(input.calendar_entry_id || '').trim(),
    client_id: String(input.client_id || 'cli_default').trim(),
    content_asset_id: String(input.content_asset_id || input.asset_id || '').trim(),
    output_targets: outputTargets,
    public_media_url: publicMediaUrl,
    media_url: publicMediaUrl,
    output_urls: resolvedOutputUrls,
    local_output_paths: localMedia.localOutputPaths,
    public_output_paths: localMedia.publicOutputPaths,
    render_host_mode: localMedia.mode,
    render_seed_source: localMedia.seedSource,
    status: RENDER_STATUSES.includes(String(input.status || '').trim()) ? String(input.status).trim() : 'queued',
    due_date: String(input.due_date || input.publish_date || addDays(new Date().toISOString(), 1)).trim(),
    notes: String(input.notes || '').trim(),
    ...systemFields,
    createdAt: input.createdAt || systemFields.created_at,
    updatedAt: new Date().toISOString(),
  };
}

function buildBundle(entry = {}, existing = {}) {
  const capacityMode = getCapacityMode();
  const shootLeadDays = capacityMode === 'low' ? 2 : 1;
  const renderEditJobId = isCanonicalId('edit_job', existing.renderJob?.edit_job_id) ? existing.renderJob.edit_job_id : existing.editJob?.id;
  const shootSchedule = normalizeShootSchedule({
    ...entry,
    ...existing.shootSchedule,
    calendar_entry_id: entry.id,
    created_at: existing.shootSchedule?.created_at,
    created_by: existing.shootSchedule?.created_by || 'system',
    source_system: 'production_ops',
    shoot_date: existing.shootSchedule?.shoot_date || addDays(entry.publish_date, -shootLeadDays),
    due_date: existing.shootSchedule?.due_date || addDays(entry.publish_date, -shootLeadDays),
    location: existing.shootSchedule?.location || inferShootLocation(entry),
    notes:
      existing.shootSchedule?.notes ||
      `Shoot for ${formatLabel(entry.platforms?.join(', ') || 'social')} with ${formatLabel(entry.cta_id || 'cta')}. Capacity mode: ${capacityMode}.`,
  });

  const editJob = normalizeEditJob({
    ...entry,
    ...existing.editJob,
    calendar_entry_id: entry.id,
    created_at: existing.editJob?.created_at,
    created_by: existing.editJob?.created_by || 'system',
    source_system: 'production_ops',
    due_date: existing.editJob?.due_date || addDays(entry.publish_date, 0),
    notes:
      existing.editJob?.notes ||
      `Edit for ${formatLabel(entry.lane || 'reach')} lane. Keep ${formatLabel(entry.journey_stage || 'problem-aware')} messaging intact.`,
  });

  const renderJob = normalizeRenderJob({
    ...entry,
    ...existing.renderJob,
    edit_job_id: renderEditJobId || editJob.id,
    calendar_entry_id: entry.id,
    created_at: existing.renderJob?.created_at,
    created_by: existing.renderJob?.created_by || 'system',
    source_system: 'production_ops',
    due_date: existing.renderJob?.due_date || entry.publish_date,
    notes:
      existing.renderJob?.notes ||
      `Render publish-ready vertical variants for ${entry.platforms?.join(', ') || 'instagram'}.`,
  });

  return { shootSchedule, editJob, renderJob };
}

export function getProductionBundleForCalendarEntry(entryId) {
  const data = loadData();
  const shootSchedule = data.shootSchedules.find((item) => item.calendar_entry_id === entryId) || null;
  const editJob = data.editJobs.find((item) => item.calendar_entry_id === entryId) || null;
  const renderJob = data.renderJobs.find((item) => item.calendar_entry_id === entryId) || null;
  if (!shootSchedule && !editJob && !renderJob) return null;
  return { shootSchedule, editJob, renderJob };
}

export function ensureProductionBundleForCalendarEntry(entry = {}) {
  if (!entry?.id) throw new Error('Calendar entry id is required');

  const data = loadData();
  const existing = {
    shootSchedule: data.shootSchedules.find((item) => item.calendar_entry_id === entry.id) || null,
    editJob: data.editJobs.find((item) => item.calendar_entry_id === entry.id) || null,
    renderJob: data.renderJobs.find((item) => item.calendar_entry_id === entry.id) || null,
  };
  const bundle = buildBundle(entry, existing);

  if (existing.shootSchedule) {
    data.shootSchedules = data.shootSchedules.map((item) => (item.id === existing.shootSchedule.id ? bundle.shootSchedule : item));
  } else {
    data.shootSchedules.unshift(bundle.shootSchedule);
    emitEvent('shootschedule.created', 'shoot_schedule', bundle.shootSchedule.id, { calendar_entry_id: entry.id }, { source_system: 'production_ops' });
  }

  if (existing.editJob) {
    data.editJobs = data.editJobs.map((item) => (item.id === existing.editJob.id ? bundle.editJob : item));
  } else {
    data.editJobs.unshift(bundle.editJob);
    emitEvent('editjob.created', 'edit_job', bundle.editJob.id, { calendar_entry_id: entry.id }, { source_system: 'production_ops' });
  }

  if (existing.renderJob) {
    data.renderJobs = data.renderJobs.map((item) => (item.id === existing.renderJob.id ? bundle.renderJob : item));
  } else {
    data.renderJobs.unshift(bundle.renderJob);
    emitEvent('renderjob.created', 'render_job', bundle.renderJob.id, { calendar_entry_id: entry.id }, { source_system: 'production_ops' });
  }

  saveData(data);
  if (bundle.renderJob?.status === 'published_ready') {
    try {
      ensurePublishJobsForCalendarEntry(entry, { renderJob: bundle.renderJob });
    } catch {}
  }
  return bundle;
}

export function listProductionBundles(entryIds = []) {
  const data = loadData();
  const filterSet = new Set(Array.isArray(entryIds) ? entryIds.filter(Boolean) : []);

  const bundles = {};
  for (const item of data.shootSchedules) {
    if (filterSet.size && !filterSet.has(item.calendar_entry_id)) continue;
    bundles[item.calendar_entry_id] = bundles[item.calendar_entry_id] || {};
    bundles[item.calendar_entry_id].shootSchedule = item;
  }
  for (const item of data.editJobs) {
    if (filterSet.size && !filterSet.has(item.calendar_entry_id)) continue;
    bundles[item.calendar_entry_id] = bundles[item.calendar_entry_id] || {};
    bundles[item.calendar_entry_id].editJob = item;
  }
  for (const item of data.renderJobs) {
    if (filterSet.size && !filterSet.has(item.calendar_entry_id)) continue;
    bundles[item.calendar_entry_id] = bundles[item.calendar_entry_id] || {};
    bundles[item.calendar_entry_id].renderJob = item;
  }
  return bundles;
}

function mapProductionStateToCalendarStatus(bundle = {}) {
  const renderStatus = bundle.renderJob?.status || '';
  const editStatus = bundle.editJob?.status || '';
  const shootStatus = bundle.shootSchedule?.status || '';

  if (renderStatus === 'approved' || renderStatus === 'published_ready') return 'ready_for_qa';
  if (renderStatus === 'rendered' || editStatus === 'rendered') return 'edited';
  if (editStatus === 'processing' || editStatus === 'queued' || shootStatus === 'handoff_to_edit') return 'in_edit';
  if (shootStatus === 'shot' || shootStatus === 'shoot_scheduled' || shootStatus === 'ready_to_shoot') return 'in_production';
  return 'planned';
}

function syncAssetAndCalendar(bundle = {}, options = {}) {
  const entryId = bundle.shootSchedule?.calendar_entry_id || bundle.editJob?.calendar_entry_id || bundle.renderJob?.calendar_entry_id;
  const assetId = bundle.editJob?.content_asset_id || bundle.renderJob?.content_asset_id;
  const changedBy = options.changedBy || 'production_ops';
  const reason = options.reason || 'Production workflow update';
  const calendarPatch = { status: mapProductionStateToCalendarStatus(bundle) };

  if (entryId) {
    try {
      updateCalendarEntry(entryId, calendarPatch);
    } catch {}
  }

  if (!assetId) return;
  const asset = getAsset(assetId);
  if (!asset) return;

  const shootStatus = bundle.shootSchedule?.status || '';
  const renderStatus = bundle.renderJob?.status || '';

  try {
    if (['ready_to_shoot', 'shoot_scheduled', 'shot', 'handoff_to_edit'].includes(shootStatus)) {
      if (['script_ready', 'script_approved'].includes(asset.state)) {
        transitionAsset(assetId, 'production_ready', { changedBy, reason });
      }
    }

    if (['rendered', 'qa_review', 'approved', 'published_ready'].includes(renderStatus)) {
      if (['production_ready', 'script_approved', 'script_ready'].includes(asset.state)) {
        transitionAsset(assetId, 'edited', { changedBy, reason });
      }
    }

    if (['approved', 'published_ready'].includes(renderStatus)) {
      const updatedAsset = getAsset(assetId);
      if (updatedAsset && updatedAsset.state === 'edited') {
        transitionAsset(assetId, 'final_qa', { changedBy, reason });
      }
    }
  } catch {}

  if (entryId && bundle.renderJob?.status === 'published_ready') {
    try {
      const updatedEntry = updateCalendarEntry(entryId, { status: 'publish_ready' });
      ensurePublishJobsForCalendarEntry(updatedEntry, { renderJob: bundle.renderJob });
    } catch {}
  }
}

export function updateProductionStatus(entryId, updates = {}, options = {}) {
  const data = loadData();
  const bundle = getProductionBundleForCalendarEntry(entryId);
  if (!bundle) throw new Error('Production bundle not found');

  let updatedBundle = {
    shootSchedule: bundle.shootSchedule,
    editJob: bundle.editJob,
    renderJob: bundle.renderJob,
  };

  if (updates.shootStatus && bundle.shootSchedule) {
    const next = normalizeShootSchedule({
      ...bundle.shootSchedule,
      status: updates.shootStatus,
      notes: updates.notes || bundle.shootSchedule.notes,
      source_system: 'production_ops',
    });
    data.shootSchedules = data.shootSchedules.map((item) => (item.id === bundle.shootSchedule.id ? next : item));
    updatedBundle.shootSchedule = next;
  }

  if (updates.editStatus && bundle.editJob) {
    const next = normalizeEditJob({
      ...bundle.editJob,
      status: updates.editStatus,
      notes: updates.notes || bundle.editJob.notes,
      source_system: 'production_ops',
    });
    data.editJobs = data.editJobs.map((item) => (item.id === bundle.editJob.id ? next : item));
    updatedBundle.editJob = next;
  }

  if (updates.renderStatus && bundle.renderJob) {
    const next = normalizeRenderJob({
      ...bundle.renderJob,
      status: updates.renderStatus,
      notes: updates.notes || bundle.renderJob.notes,
      source_system: 'production_ops',
    });
    data.renderJobs = data.renderJobs.map((item) => (item.id === bundle.renderJob.id ? next : item));
    updatedBundle.renderJob = next;
  }

  saveData(data);

  if (updates.shootStatus) {
    emitEvent('shootschedule.updated', 'shoot_schedule', updatedBundle.shootSchedule?.id || '', { status: updates.shootStatus, calendar_entry_id: entryId }, { source_system: 'production_ops' });
  }
  if (updates.editStatus) {
    emitEvent('editjob.updated', 'edit_job', updatedBundle.editJob?.id || '', { status: updates.editStatus, calendar_entry_id: entryId }, { source_system: 'production_ops' });
  }
  if (updates.renderStatus) {
    emitEvent('renderjob.updated', 'render_job', updatedBundle.renderJob?.id || '', { status: updates.renderStatus, calendar_entry_id: entryId }, { source_system: 'production_ops' });
  }

  syncAssetAndCalendar(updatedBundle, { changedBy: options.changedBy || 'production_ops', reason: options.reason || 'Production status updated' });
  return updatedBundle;
}

export function refreshAllRenderMediaUrls() {
  const data = loadData();
  data.renderJobs = (data.renderJobs || []).map((job) =>
    normalizeRenderJob({
      ...job,
      id: job.id,
      createdAt: job.createdAt,
      created_at: job.created_at,
      created_by: job.created_by || 'system',
      source_system: job.source_system || 'production_ops',
    })
  );
  saveData(data);
  return data.renderJobs;
}
