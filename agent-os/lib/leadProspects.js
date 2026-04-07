import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'lead-prospects.json');

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      prospects: [],
      lastUpdated: null,
    }, null, 2));
  }
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map((v) => String(v).trim()))];
}

function compact(value = '', max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function loadLeadProspects() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { prospects: [], lastUpdated: null };
  }
}

export function getLeadProspectById(prospectId) {
  const data = loadLeadProspects();
  return data.prospects.find((prospect) => prospect.id === prospectId) || null;
}

export function saveLeadProspects(data) {
  ensureDataFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function normalizeLeadProspect(input = {}) {
  return {
    id: input.id || `prospect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    businessName: compact(input.businessName || input.name || '', 180),
    website: String(input.website || '').trim(),
    publicEmail: String(input.publicEmail || input.email || '').trim(),
    publicPhone: String(input.publicPhone || input.phone || '').trim(),
    niche: compact(input.niche || '', 120),
    geography: compact(input.geography || '', 120),
    socialProfiles: unique(input.socialProfiles || input.social_profiles || []),
    notes: compact(input.notes || '', 1200),
    rawArtifactPath: String(input.rawArtifactPath || input.raw_artifact_path || '').trim(),
    source: String(input.source || 'cloudflare').trim(),
    sourceUrl: String(input.sourceUrl || input.url || '').trim(),
    crawlJobId: String(input.crawlJobId || input.jobId || '').trim(),
    discoveredFrom: String(input.discoveredFrom || input.discovered_from || '').trim(),
    crawlTimestamp: String(input.crawlTimestamp || input.crawledAt || '').trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function isSameProspect(a, b) {
  const websiteA = String(a?.website || '').trim();
  const websiteB = String(b?.website || '').trim();
  if (websiteA && websiteB) return websiteA === websiteB;

  const emailA = String(a?.publicEmail || '').trim();
  const emailB = String(b?.publicEmail || '').trim();
  if (emailA && emailB) return emailA === emailB;

  return (
    String(a?.businessName || '').trim().toLowerCase() === String(b?.businessName || '').trim().toLowerCase() &&
    String(a?.geography || '').trim().toLowerCase() === String(b?.geography || '').trim().toLowerCase()
  );
}

export function upsertLeadProspect(input) {
  const data = loadLeadProspects();
  const prospect = normalizeLeadProspect(input);
  const existingIndex = data.prospects.findIndex((existing) => isSameProspect(existing, prospect));

  if (existingIndex >= 0) {
    const existing = data.prospects[existingIndex];
    const merged = {
      ...existing,
      ...prospect,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.prospects.splice(existingIndex, 1);
    data.prospects.unshift(merged);
    saveLeadProspects(data);
    return { prospect: merged, created: false };
  }

  data.prospects.unshift(prospect);
  saveLeadProspects(data);
  return { prospect, created: true };
}

export function upsertLeadProspects(items = []) {
  const data = loadLeadProspects();
  const results = [];

  for (const item of items) {
    const prospect = normalizeLeadProspect(item);
    const existingIndex = data.prospects.findIndex((existing) => isSameProspect(existing, prospect));

    if (existingIndex >= 0) {
      const existing = data.prospects[existingIndex];
      const merged = {
        ...existing,
        ...prospect,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      data.prospects.splice(existingIndex, 1);
      data.prospects.unshift(merged);
      results.push({ prospect: merged, created: false });
      continue;
    }

    data.prospects.unshift(prospect);
    results.push({ prospect, created: true });
  }

  if (items.length) saveLeadProspects(data);
  return results;
}

export function updateLeadProspect(prospectId, patch = {}) {
  const data = loadLeadProspects();
  let updatedProspect = null;

  data.prospects = data.prospects.map((prospect) => {
    if (prospect.id !== prospectId) return prospect;
    updatedProspect = {
      ...prospect,
      ...patch,
      id: prospect.id,
      createdAt: prospect.createdAt,
      updatedAt: new Date().toISOString(),
    };
    return updatedProspect;
  });

  saveLeadProspects(data);
  return updatedProspect;
}
