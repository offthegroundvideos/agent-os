import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SYSTEM_DIR = path.join(DATA_DIR, 'system');
const JSON_PATH = path.join(SYSTEM_DIR, 'working-memory.json');
const MARKDOWN_PATH = path.join(process.cwd(), 'WORKING-MEMORY.md');

let refreshTimer = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function readDataFile(name, fallback) {
  return readJson(path.join(DATA_DIR, name), fallback);
}

function safeIso(value) {
  const raw = String(value || '').trim();
  return raw || null;
}

function sortByNewest(items = [], field = 'updatedAt') {
  return [...items].sort((a, b) => {
    const aTime = new Date(a?.[field] || a?.updated_at || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.[field] || b?.updated_at || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

function buildNextActions(snapshot) {
  const actions = [];
  if (!snapshot.activeClient?.id) actions.push('Set or create an active client so research and publishing stay scoped.');
  if (snapshot.bookings.pendingCount > 0) actions.push(`Review ${snapshot.bookings.pendingCount} queued or running booking research item(s).`);
  if (snapshot.processes.runningCount > 0) actions.push(`Watch ${snapshot.processes.runningCount} running process(es) for completion or failure.`);
  if (snapshot.publishing.failedJobs > 0) actions.push(`Retry or inspect ${snapshot.publishing.failedJobs} failed publish job(s).`);
  if (snapshot.production.publishReadyCount > 0) actions.push(`There are ${snapshot.production.publishReadyCount} production item(s) ready to publish.`);
  if (!actions.length) actions.push('System is stable. Focus on new bookings, pipeline runs, or publish queue work.');
  return actions;
}

function toMarkdown(snapshot) {
  const latestBooking = snapshot.bookings.latest;
  const latestAsset = snapshot.assets.latest;
  const latestPublishJob = snapshot.publishing.latestJob;
  const runningProcesses = snapshot.processes.running.map((process) => `- ${process.id}: ${process.description} (${process.status})`).join('\n') || '- None';
  const nextActions = snapshot.nextActions.map((action) => `- ${action}`).join('\n');

  return [
    '# Agent OS Working Memory',
    '',
    `Last updated: ${snapshot.generatedAt}`,
    '',
    '## Current State',
    `- Active client: ${snapshot.activeClient?.business_name || snapshot.activeClient?.name || 'None'}`,
    `- Clients tracked: ${snapshot.clients.total}`,
    `- Assets tracked: ${snapshot.assets.total}`,
    `- Calendar entries: ${snapshot.calendar.total}`,
    `- Running processes: ${snapshot.processes.runningCount}`,
    `- Booking research runs: ${snapshot.bookings.total}`,
    `- Publish jobs: ${snapshot.publishing.total}`,
    '',
    '## Latest Items',
    `- Latest booking: ${latestBooking ? `${latestBooking.companyName || latestBooking.name} (${latestBooking.status})` : 'None'}`,
    `- Latest asset: ${latestAsset ? `${latestAsset.title} (${latestAsset.state})` : 'None'}`,
    `- Latest publish job: ${latestPublishJob ? `${latestPublishJob.platform} (${latestPublishJob.publish_status})` : 'None'}`,
    '',
    '## Process Watch',
    runningProcesses,
    '',
    '## Next Actions',
    nextActions,
    '',
  ].join('\n');
}

export function refreshWorkingMemory(reason = 'manual') {
  ensureDir(SYSTEM_DIR);

  const clientsData = readJson(path.join(DATA_DIR, 'clients', 'clients.json'), { clients: [], activeClientId: null });
  const assetsData = readDataFile('assets.json', { assets: [], lastUpdated: null });
  const calendarData = readDataFile('content-calendar.json', { entries: [], lastUpdated: null });
  const processesData = readDataFile('processes.json', { processes: [] });
  const publishQueueData = readDataFile('publish-queue.json', { jobs: [], lastUpdated: null });
  const publishRuntime = readDataFile('publish-runtime.json', {});
  const productionOps = readDataFile('production-ops.json', { shootSchedules: [], editJobs: [], renderJobs: [], lastUpdated: null });
  const bookingsData = readDataFile('bookings.json', { bookings: [], lastUpdated: null });

  const clients = Array.isArray(clientsData.clients) ? clientsData.clients : [];
  const assets = sortByNewest(Array.isArray(assetsData.assets) ? assetsData.assets : []);
  const entries = sortByNewest(Array.isArray(calendarData.entries) ? calendarData.entries : []);
  const processes = sortByNewest(Array.isArray(processesData.processes) ? processesData.processes : [], 'startedAt');
  const jobs = sortByNewest(Array.isArray(publishQueueData.jobs) ? publishQueueData.jobs : []);
  const bookings = sortByNewest(Array.isArray(bookingsData.bookings) ? bookingsData.bookings : []);
  const activeClient = clients.find((client) => client.id === clientsData.activeClientId) || null;

  const snapshot = {
    app: 'agent-os',
    reason,
    generatedAt: new Date().toISOString(),
    activeClient,
    clients: {
      total: clients.length,
      activeClientId: clientsData.activeClientId || null,
      latestUpdatedAt: safeIso(sortByNewest(clients)[0]?.updatedAt),
    },
    assets: {
      total: assets.length,
      byState: assets.reduce((acc, asset) => {
        acc[asset.state || 'unknown'] = (acc[asset.state || 'unknown'] || 0) + 1;
        return acc;
      }, {}),
      latest: assets[0] || null,
    },
    calendar: {
      total: entries.length,
      publishReadyCount: entries.filter((entry) => entry.status === 'publish_ready').length,
      latest: entries[0] || null,
    },
    processes: {
      total: processes.length,
      runningCount: processes.filter((process) => process.status === 'running').length,
      running: processes.filter((process) => process.status === 'running').slice(0, 5),
      latest: processes[0] || null,
    },
    bookings: {
      total: bookings.length,
      pendingCount: bookings.filter((booking) => booking.status === 'queued' || booking.status === 'running').length,
      failedCount: bookings.filter((booking) => booking.status === 'failed').length,
      latest: bookings[0] || null,
    },
    publishing: {
      total: jobs.length,
      queuedJobs: jobs.filter((job) => job.publish_status === 'queued' || job.publish_status === 'publishing').length,
      failedJobs: jobs.filter((job) => job.publish_status === 'failed').length,
      publishedJobs: jobs.filter((job) => job.publish_status === 'published').length,
      latestJob: jobs[0] || null,
      runtime: publishRuntime,
    },
    production: {
      shoots: Array.isArray(productionOps.shootSchedules) ? productionOps.shootSchedules.length : 0,
      edits: Array.isArray(productionOps.editJobs) ? productionOps.editJobs.length : 0,
      renders: Array.isArray(productionOps.renderJobs) ? productionOps.renderJobs.length : 0,
      publishReadyCount: Array.isArray(productionOps.renderJobs)
        ? productionOps.renderJobs.filter((job) => job.status === 'published_ready').length
        : 0,
    },
  };

  snapshot.nextActions = buildNextActions(snapshot);

  fs.writeFileSync(JSON_PATH, JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(MARKDOWN_PATH, toMarkdown(snapshot));
  return snapshot;
}

export function loadWorkingMemory() {
  return readJson(JSON_PATH, null) || refreshWorkingMemory('bootstrap');
}

export function queueWorkingMemoryRefresh(reason = 'background-update') {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    try {
      refreshWorkingMemory(reason);
    } catch {}
  }, 150);
}
