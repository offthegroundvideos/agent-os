import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'media-intelligence.json');

export const SOURCE_MEDIA_STATES = [
  'uploaded',
  'ingested',
  'transcribed',
  'segmented',
  'clip_candidates_created',
  'approved_for_use',
  'archived',
  'ingest_failed',
  'transcription_failed',
  'segmentation_failed',
];

const SOURCE_MEDIA_TRANSITIONS = {
  uploaded: ['ingested', 'ingest_failed'],
  ingested: ['transcribed', 'transcription_failed'],
  transcribed: ['segmented', 'segmentation_failed'],
  segmented: ['clip_candidates_created'],
  clip_candidates_created: ['approved_for_use', 'archived'],
  approved_for_use: ['archived'],
  archived: [],
  ingest_failed: ['uploaded'],
  transcription_failed: ['ingested'],
  segmentation_failed: ['transcribed'],
};

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ source_media: [], clip_candidates: [], transcripts: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { source_media: [], clip_candidates: [], transcripts: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalizeSourceMedia(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || input.addedBy || 'human',
    source_system: input.source_system || 'agent-os',
  });
  return {
    id: input.id || createCanonicalId('source_media'),
    client_id: String(input.client_id || input.clientId || 'cli_default').trim(),
    type: String(input.type || 'video').trim(),
    storage_uri: String(input.storage_uri || input.storageUri || input.filepath || '').trim(),
    duration_sec: Number(input.duration_sec || input.durationSec || 0),
    orientation: String(input.orientation || 'landscape').trim(),
    ingest_status: String(input.ingest_status || input.ingestStatus || 'uploaded').trim(),
    checksum: String(input.checksum || '').trim(),
    captured_at: input.captured_at || input.capturedAt || input.shootDate || new Date().toISOString(),
    title: String(input.title || '').trim(),
    filename: String(input.filename || '').trim(),
    location: String(input.location || '').trim(),
    categories: Array.isArray(input.categories) ? input.categories : [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    source_library_clip_id: String(input.source_library_clip_id || input.sourceLibraryClipId || '').trim(),
    state_history: input.state_history || [{
      state: 'uploaded',
      changed_at: new Date().toISOString(),
      changed_by: system.created_by,
      reason: 'Media uploaded',
    }],
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeClipCandidate(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'media_intelligence',
  });
  return {
    id: input.id || createCanonicalId('clip_candidate'),
    source_media_id: String(input.source_media_id || input.sourceMediaId || '').trim(),
    start_ms: Number(input.start_ms || input.startMs || 0),
    end_ms: Number(input.end_ms || input.endMs || 0),
    speaker: String(input.speaker || '').trim(),
    topic_tags: Array.isArray(input.topic_tags) ? input.topic_tags : [],
    proof_tags: Array.isArray(input.proof_tags) ? input.proof_tags : [],
    score: {
      hook_potential: Number(input.score?.hook_potential || 0),
      proof_strength: Number(input.score?.proof_strength || 0),
      visual_strength: Number(input.score?.visual_strength || 0),
      cta_fit: Number(input.score?.cta_fit || 0),
    },
    recommended_use: Array.isArray(input.recommended_use) ? input.recommended_use : [],
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createSourceMedia(input = {}) {
  const data = loadData();
  const media = normalizeSourceMedia(input);
  data.source_media.unshift(media);
  saveData(data);
  emitEvent('media.uploaded', 'source_media', media.id, { ingest_status: media.ingest_status, title: media.title }, {
    source_system: media.source_system,
  });
  return media;
}

export function listSourceMedia() {
  return loadData().source_media;
}

export function getSourceMedia(id) {
  return loadData().source_media.find((media) => media.id === id) || null;
}

export function transitionSourceMedia(id, nextState, options = {}) {
  const data = loadData();
  const media = data.source_media.find((item) => item.id === id);
  if (!media) throw new Error('Source media not found');
  const allowed = SOURCE_MEDIA_TRANSITIONS[media.ingest_status] || [];
  if (!allowed.includes(nextState)) throw new Error(`Invalid source media transition from ${media.ingest_status} to ${nextState}`);

  media.ingest_status = nextState;
  media.version = Number(media.version || 1) + 1;
  media.updated_at = new Date().toISOString();
  media.updatedAt = new Date().toISOString();
  media.state_history.push({
    state: nextState,
    changed_at: new Date().toISOString(),
    changed_by: options.changed_by || 'system',
    reason: options.reason || '',
  });
  saveData(data);

  const eventMap = {
    ingested: 'media.ingested',
    transcribed: 'media.transcribed',
    segmented: 'media.segmented',
  };
  if (eventMap[nextState]) {
    emitEvent(eventMap[nextState], 'source_media', media.id, { state: nextState }, {
      source_system: options.source_system || 'media_intelligence',
    });
  }
  return media;
}

export function addClipCandidate(input = {}) {
  const data = loadData();
  const clip = normalizeClipCandidate(input);
  data.clip_candidates.unshift(clip);
  const media = data.source_media.find((item) => item.id === clip.source_media_id);
  if (media && media.ingest_status === 'segmented') {
    media.ingest_status = 'clip_candidates_created';
    media.version = Number(media.version || 1) + 1;
    media.updated_at = new Date().toISOString();
    media.updatedAt = new Date().toISOString();
    media.state_history.push({
      state: 'clip_candidates_created',
      changed_at: new Date().toISOString(),
      changed_by: clip.created_by,
      reason: 'Clip candidate created',
    });
    emitEvent('clip.created', 'clip_candidate', clip.id, { source_media_id: clip.source_media_id }, {
      source_system: clip.source_system,
    });
    emitEvent('media.segmented', 'source_media', media.id, { transitioned_to: 'clip_candidates_created', clip_candidate_created: true }, {
      source_system: clip.source_system,
    });
  } else {
    emitEvent('clip.created', 'clip_candidate', clip.id, { source_media_id: clip.source_media_id }, {
      source_system: clip.source_system,
    });
  }
  saveData(data);
  return clip;
}

export function listClipCandidates(filters = {}) {
  let clips = loadData().clip_candidates;
  if (filters.source_media_id) clips = clips.filter((clip) => clip.source_media_id === filters.source_media_id);
  return clips;
}
