import fs from 'fs';
import path from 'path';
import { createCanonicalId } from './canonicalDataModel.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'prospect-radar.json');

const MONTHS = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ opportunities: [], lastUpdated: null }, null, 2));
  }
}

function compact(value = '', max = 800) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateValue(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso;

  const mdY = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (mdY) {
    const month = Number(mdY[1]) - 1;
    const day = Number(mdY[2]);
    let year = mdY[3] ? Number(mdY[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const monthName = raw.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:,?\s+(\d{2,4}))?/i);
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase().replace('.', '')];
    const day = Number(monthName[2]);
    let year = monthName[3] ? Number(monthName[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function extractEventDate(input = {}) {
  const explicit = parseDateValue(input.eventDate || input.requestedDate || input.event_date || input.dateNeeded || input.date_needed);
  if (explicit) return explicit.toISOString();

  const combined = [
    input.title,
    input.summary,
    input.requestText,
    input.notes,
  ].filter(Boolean).join(' ');
  const parsed = parseDateValue(combined);
  return parsed ? parsed.toISOString() : '';
}

function deriveDateStatus({ eventDate, postedAt, expiresAt }) {
  const today = startOfToday();
  const event = parseDateValue(eventDate);
  if (event) {
    const dateOnly = new Date(event.getFullYear(), event.getMonth(), event.getDate());
    if (dateOnly < today) return 'passed';
    if (dateOnly.getTime() === today.getTime()) return 'today';
    return 'upcoming';
  }

  const expires = parseDateValue(expiresAt);
  if (expires) {
    const dateOnly = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
    if (dateOnly < today) return 'expired';
  }

  const posted = parseDateValue(postedAt);
  if (posted) {
    const ageDays = Math.floor((Date.now() - posted.getTime()) / 86400000);
    if (ageDays <= 3) return 'fresh';
    if (ageDays <= 14) return 'recent';
  }

  return 'unknown';
}

function deriveFreshnessScore(postedAt) {
  const posted = parseDateValue(postedAt);
  if (!posted) return 50;
  const ageDays = Math.max(0, Math.floor((Date.now() - posted.getTime()) / 86400000));
  if (ageDays <= 1) return 100;
  if (ageDays <= 3) return 92;
  if (ageDays <= 7) return 84;
  if (ageDays <= 14) return 72;
  if (ageDays <= 30) return 58;
  return 35;
}

function deriveQualificationScore(record = {}) {
  let score = 0;
  const text = `${record.title || ''} ${record.summary || ''}`.toLowerCase();
  if (record.sourceUrl) score += 20;
  if (record.location) score += 15;
  if (record.requestedService || record.niche) score += 15;
  if (['upcoming', 'today', 'fresh', 'recent'].includes(record.dateStatus)) score += 20;
  if (text.includes('looking for') || text.includes('need') || text.includes('recommend')) score += 15;
  if (text.includes('photographer') || text.includes('videographer') || text.includes('trainer') || text.includes('service')) score += 10;
  if (record.outreachAngle) score += 5;
  return Math.max(0, Math.min(100, score));
}

function deriveSuggestedAction(record = {}) {
  if (record.dateStatus === 'passed' || record.dateStatus === 'expired') return 'Skip';
  if (record.qualificationScore >= 75) return 'Comment fast';
  if (record.qualificationScore >= 55) return 'Review and reply';
  return 'Manual review';
}

function normalizeYear(year = '') {
  const raw = String(year || '').trim();
  if (!raw) return '';
  return /^\d{4}$/.test(raw) ? raw : '';
}

function buildSearchQueries(topic, area, year, category = 'general') {
  const areaSuffix = area ? ` ${area}` : '';
  const yearSuffix = year ? ` ${year}` : '';
  const baseTopic = `${topic}${yearSuffix}`.trim();

  const common = [
    {
      id: 'google-public-community',
      label: 'Google Public Communities',
      note: 'Public web only. Good first pass for service-request posts.',
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("looking for" OR need OR recommend OR hiring) ${areaSuffix}`)}`,
    },
    {
      id: 'google-reddit',
      label: 'Google + Reddit',
      note: 'Good for direct service-request threads and recommendations.',
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:reddit.com "${baseTopic}" ("looking for" OR need OR recommend OR hiring) ${areaSuffix}`)}`,
    },
    {
      id: 'google-local-forums',
      label: 'Google + Local Forums',
      note: 'Searches public forums, bulletin boards, and community sites.',
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("looking for" OR need OR recommend OR hiring) forum OR community ${areaSuffix}`)}`,
    },
    {
      id: 'nextdoor-manual',
      label: 'Nextdoor Manual Review',
      note: 'Use manually in the app or official developer surfaces only.',
      url: 'https://nextdoor.com/',
    },
  ];

  if (category === 'weddings') {
    common.splice(1, 0,
      {
        id: 'google-facebook-public',
        label: 'Google + Public Facebook Results',
        note: 'Public Facebook pages/posts only. Not private groups.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com "${baseTopic}" ("looking for photographer" OR "need videographer" OR "wedding planner recommendation") ${areaSuffix}`)}`,
      },
      {
        id: 'google-wedding-forums',
        label: 'Google + Wedding Forums',
        note: 'Searches public wedding planning posts and request threads.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("looking for photographer" OR "need videographer" OR "recommendation") ("weddingwire" OR "the knot" OR bride OR wedding forum) ${areaSuffix}`)}`,
      },
    );
  } else if (category === 'festivals') {
    common.splice(1, 0,
      {
        id: 'google-festival-hiring',
        label: 'Festival Hiring Search',
        note: 'Looks for public festival/vendor/staffing pages requesting creative coverage.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("hiring photographer" OR "need videographer" OR "media team") festival ${areaSuffix}`)}`,
      },
      {
        id: 'google-event-board',
        label: 'Event Boards',
        note: 'Searches public event and opportunity boards for future coverage needs.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("call for media" OR "looking for photographer" OR "videographer needed") ${areaSuffix}`)}`,
      },
    );
  } else if (category === 'automotive') {
    common.splice(1, 0,
      {
        id: 'google-automotive-requests',
        label: 'Automotive Request Search',
        note: 'Searches public forums and local request posts for car work.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("need mechanic" OR "looking for body shop" OR "recommendation") ${areaSuffix}`)}`,
      },
      {
        id: 'google-automotive-forums',
        label: 'Automotive Forums',
        note: 'Searches public automotive communities and local boards.',
        url: `https://www.google.com/search?q=${encodeURIComponent(`"${baseTopic}" ("need help" OR "shop recommendation" OR "looking for") forum ${areaSuffix}`)}`,
      },
    );
  }

  return common;
}

export function buildProspectSearchTemplates({ niche = '', location = '', year = '', category = 'general' } = {}) {
  const topic = compact(niche, 120) || 'wedding photography';
  const area = compact(location, 120);
  const targetYear = normalizeYear(year);
  return buildSearchQueries(topic, area, targetYear, category);
}

export function loadProspectRadar() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { opportunities: [], lastUpdated: null };
  }
}

export function saveProspectRadar(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function normalizeOpportunity(input = {}) {
  const postedAt = input.postedAt || input.posted_at || input.discoveredAt || input.createdAt || new Date().toISOString();
  const eventDate = extractEventDate(input);
  const dateStatus = deriveDateStatus({
    eventDate,
    postedAt,
    expiresAt: input.expiresAt || input.expires_at || '',
  });

  const record = {
    id: input.id || createCanonicalId('opportunity'),
    title: compact(input.title || input.headline || input.requestTitle || 'Untitled request', 180),
    summary: compact(input.summary || input.requestText || input.notes || '', 1200),
    niche: compact(input.niche || '', 120),
    requestedService: compact(input.requestedService || input.service || input.serviceType || input.niche || '', 140),
    sourcePlatform: compact(input.sourcePlatform || input.source || 'public-web', 80).toLowerCase(),
    sourceLabel: compact(input.sourceLabel || input.communityName || input.groupName || input.sourcePlatform || input.source || 'Public web', 140),
    sourceUrl: String(input.sourceUrl || input.url || '').trim(),
    directActionUrl: String(input.directActionUrl || input.actionUrl || input.sourceUrl || input.url || '').trim(),
    location: compact(input.location || input.geography || '', 140),
    posterName: compact(input.posterName || input.author || '', 120),
    postedAt,
    eventDate,
    expiresAt: String(input.expiresAt || input.expires_at || '').trim(),
    dateStatus,
    freshnessScore: deriveFreshnessScore(postedAt),
    outreachAngle: compact(input.outreachAngle || input.suggestedReplyAngle || '', 300),
    recommendedAction: '',
    qualificationScore: 0,
    tags: unique(input.tags || input.keywords || []),
    queryUsed: compact(input.queryUsed || input.query || '', 300),
    rawArtifactPath: String(input.rawArtifactPath || input.raw_artifact_path || '').trim(),
    crawlJobId: String(input.crawlJobId || input.jobId || '').trim(),
    discoveredFrom: String(input.discoveredFrom || input.discovered_from || '').trim(),
    status: String(input.status || (dateStatus === 'passed' || dateStatus === 'expired' ? 'expired' : 'active')).trim(),
    outreachStatus: String(input.outreachStatus || 'not_started').trim(),
    promotedLeadId: String(input.promotedLeadId || '').trim(),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  record.qualificationScore = deriveQualificationScore(record);
  record.recommendedAction = deriveSuggestedAction(record);
  return record;
}

function isSameOpportunity(a, b) {
  const urlA = String(a?.sourceUrl || '').trim();
  const urlB = String(b?.sourceUrl || '').trim();
  if (urlA && urlB) return urlA === urlB;

  return (
    String(a?.title || '').trim().toLowerCase() === String(b?.title || '').trim().toLowerCase() &&
    String(a?.location || '').trim().toLowerCase() === String(b?.location || '').trim().toLowerCase() &&
    String(a?.eventDate || '').trim() === String(b?.eventDate || '').trim()
  );
}

export function upsertOpportunities(items = []) {
  const data = loadProspectRadar();
  const results = [];

  for (const item of items) {
    const opportunity = normalizeOpportunity(item);
    const existingIndex = data.opportunities.findIndex((existing) => isSameOpportunity(existing, opportunity));

    if (existingIndex >= 0) {
      const existing = data.opportunities[existingIndex];
      const merged = {
        ...existing,
        ...opportunity,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      data.opportunities.splice(existingIndex, 1);
      data.opportunities.unshift(merged);
      results.push({ opportunity: merged, created: false });
      continue;
    }

    data.opportunities.unshift(opportunity);
    results.push({ opportunity, created: true });
  }

  if (items.length) saveProspectRadar(data);
  return results;
}

export function getOpportunityById(opportunityId) {
  const data = loadProspectRadar();
  return data.opportunities.find((opportunity) => opportunity.id === opportunityId) || null;
}

export function updateOpportunity(opportunityId, patch = {}) {
  const data = loadProspectRadar();
  let updated = null;

  data.opportunities = data.opportunities.map((item) => {
    if (item.id !== opportunityId) return item;
    updated = normalizeOpportunity({
      ...item,
      ...patch,
      id: item.id,
      createdAt: item.createdAt,
    });
    return updated;
  });

  saveProspectRadar(data);
  return updated;
}

export function getProspectRadarSummary() {
  const data = loadProspectRadar();
  const opportunities = data.opportunities || [];
  const active = opportunities.filter((item) => item.status === 'active').length;
  const actioned = opportunities.filter((item) => item.outreachStatus === 'actioned').length;
  const upcoming = opportunities.filter((item) => item.dateStatus === 'upcoming' || item.dateStatus === 'today').length;
  const review = opportunities.filter((item) => item.status === 'active' && item.qualificationScore >= 55).length;
  return {
    total: opportunities.length,
    active,
    actioned,
    upcoming,
    needsReview: review,
    lastUpdated: data.lastUpdated || null,
  };
}
