import fs from 'fs';
import path from 'path';
import { loadPublishRuntime } from './publishRuntime.js';

const RENDER_MEDIA_DIR = path.join(process.cwd(), 'data', 'render-media');
const PUBLIC_RENDER_MEDIA_DIR = path.join(process.cwd(), 'public', 'render-media');
const DEFAULT_SEED_CANDIDATES = [
  path.join(process.cwd(), '..', 'deer-flow', 'frontend', 'public', 'demo', 'threads', '4f3e55ee-f853-43db-bfb3-7d1a411f03cb', 'user-data', 'outputs', 'darcy-proposal-video.mp4'),
];

let cachedSeedPath = null;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveSeedPath() {
  if (cachedSeedPath && fs.existsSync(cachedSeedPath)) return cachedSeedPath;

  const envSeed = String(process.env.RENDER_MEDIA_SEED_FILE || '').trim();
  if (envSeed && fs.existsSync(envSeed)) {
    cachedSeedPath = envSeed;
    return cachedSeedPath;
  }

  for (const candidate of DEFAULT_SEED_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      cachedSeedPath = candidate;
      return cachedSeedPath;
    }
  }

  return '';
}

function platformToFilename(platform = 'instagram') {
  const safe = String(platform || 'instagram').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${safe || 'instagram'}.mp4`;
}

export function getPublicMediaBaseUrl() {
  const runtime = loadPublishRuntime();
  return (
    String(runtime.publicMediaBaseUrl || '').trim() ||
    String(runtime.nextPublicAppUrl || '').trim() ||
    String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim() ||
    String(process.env.NEXT_PUBLIC_APP_URL || '').trim() ||
    'http://localhost:4000'
  ).replace(/\/+$/, '');
}

export function getRenderMediaPath(renderJobId, platform = 'instagram') {
  return path.join(RENDER_MEDIA_DIR, String(renderJobId || '').trim(), platformToFilename(platform));
}

export function getPublicRenderMediaPath(renderJobId, platform = 'instagram') {
  return path.join(PUBLIC_RENDER_MEDIA_DIR, String(renderJobId || '').trim(), platformToFilename(platform));
}

export function getPublicRenderMediaUrl(renderJobId, platform = 'instagram') {
  return `${getPublicMediaBaseUrl()}/render-media/${String(renderJobId || '').trim()}/${platformToFilename(platform)}`;
}

export function ensureRenderMediaOutputs(renderJobId, platforms = []) {
  const seedPath = resolveSeedPath();
  const platformList = Array.isArray(platforms) ? platforms.filter(Boolean) : [];
  const outputDir = path.join(RENDER_MEDIA_DIR, String(renderJobId || '').trim());
  const publicOutputDir = path.join(PUBLIC_RENDER_MEDIA_DIR, String(renderJobId || '').trim());
  ensureDir(outputDir);
  ensureDir(publicOutputDir);

  const localOutputPaths = {};
  const publicOutputPaths = {};
  const publicOutputUrls = {};
  for (const platform of platformList) {
    const outputPath = getRenderMediaPath(renderJobId, platform);
    const publicOutputPath = getPublicRenderMediaPath(renderJobId, platform);
    if (seedPath && !fs.existsSync(outputPath)) {
      fs.copyFileSync(seedPath, outputPath);
    }
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, publicOutputPath);
    }
    if (fs.existsSync(outputPath)) {
      localOutputPaths[String(platform).toLowerCase()] = outputPath;
    }
    if (fs.existsSync(publicOutputPath)) {
      const key = String(platform).toLowerCase();
      publicOutputPaths[key] = publicOutputPath;
      publicOutputUrls[key] = getPublicRenderMediaUrl(renderJobId, platform);
    }
  }

  return {
    mode: Object.keys(publicOutputUrls).length ? 'public_static_file' : Object.keys(localOutputPaths).length ? 'local_file' : 'placeholder',
    seedSource: seedPath,
    localOutputPaths,
    publicOutputPaths,
    publicOutputUrls,
  };
}

export function readRenderMediaFile(renderJobId, platform = 'instagram') {
  const requestedPath = getRenderMediaPath(renderJobId, platform);
  if (fs.existsSync(requestedPath)) {
    return {
      path: requestedPath,
      filename: path.basename(requestedPath),
      size: fs.statSync(requestedPath).size,
      contentType: 'video/mp4',
    };
  }

  const outputDir = path.join(RENDER_MEDIA_DIR, String(renderJobId || '').trim());
  if (!fs.existsSync(outputDir)) return null;

  const fallback = fs.readdirSync(outputDir).find((name) => name.toLowerCase().endsWith('.mp4'));
  if (!fallback) return null;

  const fallbackPath = path.join(outputDir, fallback);
  return {
    path: fallbackPath,
    filename: fallback,
    size: fs.statSync(fallbackPath).size,
    contentType: 'video/mp4',
  };
}

export function getRenderMediaHealth(renderJobId, platform = 'instagram') {
  const file = readRenderMediaFile(renderJobId, platform);
  return {
    available: !!file,
    seedSource: resolveSeedPath(),
    publicBaseUrl: getPublicMediaBaseUrl(),
    publicUrl: getPublicRenderMediaUrl(renderJobId, platform),
    path: file?.path || '',
    filename: file?.filename || '',
    size: file?.size || 0,
  };
}
