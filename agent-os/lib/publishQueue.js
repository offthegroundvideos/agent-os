import fs from 'fs';
import path from 'path';
import { findBestLandingPageMatch } from './funnelRecords.js';
import { getPublishingGatewaySummary } from './publishingGateway.js';
import { queueWorkingMemoryRefresh } from './workingMemory.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'publish-queue.json');
export const PUBLISH_JOB_STATUSES = ['draft', 'queued', 'publishing', 'published', 'failed'];

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ jobs: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    let mutated = false;
    const repairedJobs = jobs.map((job) => {
      if (
        job &&
        job.publish_status === 'draft' &&
        job.platform_post_id &&
        job.post_url &&
        !job.error
      ) {
        mutated = true;
        return {
          ...job,
          publish_status: 'published',
          updatedAt: job.updatedAt || new Date().toISOString(),
        };
      }
      return job;
    });
    if (mutated) {
      const repaired = { ...data, jobs: repairedJobs };
      saveData(repaired);
      return repaired;
    }
    return data;
  } catch {
    return { jobs: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  queueWorkingMemoryRefresh('publish-queue-updated');
}

function createPublishJobId() {
  return `pub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizePlatforms(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

function buildDefaultCaption(entry = {}) {
  const hook = entry.hook_text || entry.title || entry.topic || 'New post';
  const cta = entry.cta_id && entry.cta_id !== 'cta_default' ? entry.cta_id.replace(/^cta_/, '').replace(/_/g, ' ') : 'Comment for the next step';
  return `${hook}\n\nSpecific value. Clear takeaway. ${cta}.`;
}

function normalizeJob(input = {}) {
  const requestedStatus = String(input.publish_status || input.status || '').trim();
  const status = PUBLISH_JOB_STATUSES.includes(requestedStatus) ? requestedStatus : 'draft';
  const landingPage =
    input.landing_page_id || input.landingPageId
      ? { id: input.landing_page_id || input.landingPageId }
      : findBestLandingPageMatch({
          client_id: input.client_id,
          campaign_id: input.campaign_id,
          cta_id: input.cta_id,
          offer_id: input.offer_id,
        });

  return {
    id: input.id || createPublishJobId(),
    calendar_entry_id: String(input.calendar_entry_id || '').trim(),
    asset_id: String(input.asset_id || '').trim(),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    platform: String(input.platform || 'instagram').trim(),
    scheduled_for: String(input.scheduled_for || '').trim(),
    caption: String(input.caption || buildDefaultCaption(input)).trim(),
    cta_id: String(input.cta_id || 'cta_default').trim(),
    landing_page_id: String(landingPage?.id || input.landing_page_id || 'lpg_default').trim(),
    content_asset_id: String(input.content_asset_id || input.asset_id || '').trim(),
    render_job_id: String(input.render_job_id || '').trim(),
    media_url: String(input.media_url || input.mediaUrl || '').trim(),
    publish_status: status,
    publish_method: String(input.publish_method || input.method || '').trim(),
    adapter_mode: String(input.adapter_mode || '').trim(),
    platform_payload: input.platform_payload || null,
    attempts: Number(input.attempts || 0),
    last_attempt_at: String(input.last_attempt_at || '').trim(),
    last_error_at: String(input.last_error_at || '').trim(),
    published_post_id: String(input.published_post_id || '').trim(),
    published_at: String(input.published_at || '').trim(),
    platform_post_id: String(input.platform_post_id || '').trim(),
    post_url: String(input.post_url || '').trim(),
    error: String(input.error || '').trim(),
    notes: String(input.notes || '').trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listPublishJobs(filters = {}) {
  let jobs = loadData().jobs || [];
  if (filters.calendar_entry_id) jobs = jobs.filter((job) => job.calendar_entry_id === filters.calendar_entry_id);
  if (filters.asset_id) jobs = jobs.filter((job) => job.asset_id === filters.asset_id);
  if (filters.client_id) jobs = jobs.filter((job) => job.client_id === filters.client_id);
  if (filters.status) jobs = jobs.filter((job) => job.publish_status === filters.status);
  return jobs.slice().sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

export function getPublishJob(id) {
  return loadData().jobs.find((job) => job.id === id) || null;
}

export function upsertPublishJob(input = {}) {
  const data = loadData();
  const existingIndex = data.jobs.findIndex((job) =>
    (input.id && job.id === input.id) ||
    (input.calendar_entry_id && job.calendar_entry_id === input.calendar_entry_id && job.platform === String(input.platform || 'instagram').trim())
  );

  if (existingIndex >= 0) {
    const next = normalizeJob({
      ...data.jobs[existingIndex],
      ...input,
      id: data.jobs[existingIndex].id,
      createdAt: data.jobs[existingIndex].createdAt,
    });
    data.jobs[existingIndex] = next;
    saveData(data);
    return next;
  }

  const job = normalizeJob(input);
  data.jobs.unshift(job);
  saveData(data);
  return job;
}

export function ensurePublishJobsForCalendarEntry(entry = {}, options = {}) {
  const platforms = normalizePlatforms(entry.platforms).length ? normalizePlatforms(entry.platforms) : ['instagram'];
  return platforms.map((platform) =>
    upsertPublishJob({
      calendar_entry_id: entry.id,
      asset_id: entry.asset_id,
      content_asset_id: entry.asset_id,
      client_id: entry.client_id,
      campaign_id: entry.campaign_id,
      platform,
      scheduled_for: `${entry.publish_date || ''}T${entry.publish_time || '09:00'}:00`,
      caption: buildDefaultCaption(entry),
      cta_id: entry.cta_id,
      render_job_id: options.renderJob?.id || '',
      media_url:
        options.renderJob?.output_urls?.[platform] ||
        options.renderJob?.public_media_url ||
        '',
      notes: `Publish queued from content calendar for ${platform}.`,
      status: 'queued',
      ...getPublishingGatewaySummary({ platform, cta_id: entry.cta_id, landing_page_id: entry.landing_page_id, caption: buildDefaultCaption(entry) }, { calendarEntry: entry }),
    })
  );
}

export function updatePublishJob(id, patch = {}) {
  const data = loadData();
  const index = data.jobs.findIndex((job) => job.id === id);
  if (index < 0) throw new Error('Publish job not found');
  data.jobs[index] = normalizeJob({
    ...data.jobs[index],
    ...patch,
    id: data.jobs[index].id,
    createdAt: data.jobs[index].createdAt,
  });
  saveData(data);
  return data.jobs[index];
}
