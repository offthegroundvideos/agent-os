import fs from 'fs';
import path from 'path';
import { queueWorkingMemoryRefresh } from './workingMemory.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'publish-runtime.json');

const DEFAULT_STATE = {
  publicMediaBaseUrl: '',
  nextPublicAppUrl: '',
  instagramMode: '',
  facebookMode: '',
  tiktokMode: '',
  youtubeMode: '',
  linkedinMode: '',
  xMode: '',
  updatedAt: null,
};

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2));
  }
}

export function loadPublishRuntime() {
  ensureFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    return { ...DEFAULT_STATE, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function savePublishRuntime(patch = {}) {
  const current = loadPublishRuntime();
  const next = {
    ...current,
    ...patch,
    publicMediaBaseUrl: String(patch.publicMediaBaseUrl ?? current.publicMediaBaseUrl ?? '').trim(),
    nextPublicAppUrl: String(patch.nextPublicAppUrl ?? current.nextPublicAppUrl ?? '').trim(),
    instagramMode: String(patch.instagramMode ?? current.instagramMode ?? '').trim().toLowerCase(),
    facebookMode: String(patch.facebookMode ?? current.facebookMode ?? '').trim().toLowerCase(),
    tiktokMode: String(patch.tiktokMode ?? current.tiktokMode ?? '').trim().toLowerCase(),
    youtubeMode: String(patch.youtubeMode ?? current.youtubeMode ?? '').trim().toLowerCase(),
    linkedinMode: String(patch.linkedinMode ?? current.linkedinMode ?? '').trim().toLowerCase(),
    xMode: String(patch.xMode ?? current.xMode ?? '').trim().toLowerCase(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(next, null, 2));
  queueWorkingMemoryRefresh('publish-runtime-updated');
  return next;
}
