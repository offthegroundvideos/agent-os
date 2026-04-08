import fs from 'fs';
import path from 'path';

const VIDEO_EDITOR_API = process.env.VIDEO_EDITOR_API_BASE_URL || 'http://127.0.0.1:8000';
const VIDEO_EDITOR_WEB = process.env.NEXT_PUBLIC_VIDEO_EDITOR_URL || 'http://127.0.0.1:3300';
const VIDEO_EDITOR_PROJECT_ID = process.env.NEXT_PUBLIC_VIDEO_EDITOR_PROJECT_ID || 'demo-social-cut';
const FOOTAGE_LIBRARY_FILE = path.join(process.cwd(), 'data', 'footage', 'library.json');
const DEFAULT_FOOTAGE_ROOT = path.join(path.dirname(process.cwd()), 'footage-library');
const VIDEO_EDITOR_OUTPUT_ROOT =
  process.env.VIDEO_EDITOR_OUTPUT_DIR || path.join('C:\\Video Editor', 'outputs');

function loadLibrary() {
  try {
    if (!fs.existsSync(FOOTAGE_LIBRARY_FILE)) {
      return { clips: [], collections: [], lastUpdated: null };
    }
    return JSON.parse(fs.readFileSync(FOOTAGE_LIBRARY_FILE, 'utf-8'));
  } catch {
    return { clips: [], collections: [], lastUpdated: null };
  }
}

async function requestEditor(pathname, init = {}) {
  const response = await fetch(`${VIDEO_EDITOR_API}${pathname}`, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof json?.detail === 'string' ? json.detail : `Video editor request failed with ${response.status}`;
    throw new Error(detail);
  }
  return json;
}

function normalizeCandidatePaths(clip) {
  const candidates = [];
  if (clip.filepath) {
    candidates.push(clip.filepath);
  }
  if (clip.filename) {
    candidates.push(path.join(DEFAULT_FOOTAGE_ROOT, clip.filename));
    candidates.push(path.join(DEFAULT_FOOTAGE_ROOT, 'raw', clip.filename));
    candidates.push(path.join(DEFAULT_FOOTAGE_ROOT, 'edited', clip.filename));
    candidates.push(path.join(DEFAULT_FOOTAGE_ROOT, 'stock', clip.filename));
  }
  return [...new Set(candidates)];
}

function resolveClipPath(clip) {
  for (const candidate of normalizeCandidatePaths(clip)) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getExportStatus(projectId) {
  const outputFile = path.join(VIDEO_EDITOR_OUTPUT_ROOT, `${projectId}.mp4`);
  if (!fs.existsSync(outputFile)) {
    return {
      exists: false,
      outputPath: outputFile,
    };
  }
  const stat = fs.statSync(outputFile);
  return {
    exists: true,
    outputPath: outputFile,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

function summarizeProject(project) {
  const assetCount = Array.isArray(project?.assets) ? project.assets.length : 0;
  const promptRuns = Array.isArray(project?.promptHistory) ? project.promptHistory.length : 0;
  return {
    id: project?.id,
    title: project?.title,
    status: project?.status,
    lastSummary: project?.lastSummary || null,
    assetCount,
    promptRuns,
    compositionDurationSeconds:
      project?.composition?.fps && project?.composition?.durationInFrames
        ? Number((project.composition.durationInFrames / project.composition.fps).toFixed(2))
        : null,
    updatedAt: project?.updatedAt || null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'status';
  const projectId = searchParams.get('projectId') || VIDEO_EDITOR_PROJECT_ID;

  try {
    if (action === 'footage') {
      const library = loadLibrary();
      const clips = library.clips.map((clip) => {
        const resolvedPath = resolveClipPath(clip);
        return {
          ...clip,
          resolvedPath,
          canSendToEditor: Boolean(resolvedPath),
        };
      });
      return Response.json({
        clips,
        total: clips.length,
      });
    }

    if (action === 'status') {
      const [project, resolveStatus] = await Promise.all([
        requestEditor(`/projects/${projectId}`),
        requestEditor(`/projects/${projectId}/resolve/status`).catch((error) => ({
          configured: false,
          liveAvailable: false,
          issue: error.message,
        })),
      ]);
      return Response.json({
        project: summarizeProject(project),
        resolveStatus,
        exportStatus: getExportStatus(projectId),
        editorUrl: `${VIDEO_EDITOR_WEB.replace(/\/$/, '')}/projects/${projectId}`,
        apiBase: VIDEO_EDITOR_API,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action;
    const projectId = body.projectId || VIDEO_EDITOR_PROJECT_ID;

    if (action === 'sendClip') {
      const library = loadLibrary();
      const clip = library.clips.find((item) => item.id === body.clipId);
      if (!clip) {
        return Response.json({ error: 'Clip not found' }, { status: 404 });
      }
      const resolvedPath = resolveClipPath(clip);
      if (!resolvedPath) {
        return Response.json({ error: 'No reachable file path was found for this clip.' }, { status: 400 });
      }

      const project = await requestEditor(`/projects/${projectId}/assets/from-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: resolvedPath,
          label: clip.title || clip.filename || clip.id,
          analyze: true,
          copyIntoProject: true,
        }),
      });

      return Response.json({
        success: true,
        clipId: clip.id,
        resolvedPath,
        project: summarizeProject(project),
      });
    }

    if (action === 'sendClips') {
      const clipIds = Array.isArray(body.clipIds) ? body.clipIds : [];
      const library = loadLibrary();
      const sent = [];
      const skipped = [];

      for (const clipId of clipIds) {
        const clip = library.clips.find((item) => item.id === clipId);
        if (!clip) {
          skipped.push({ clipId, reason: 'Clip not found' });
          continue;
        }
        const resolvedPath = resolveClipPath(clip);
        if (!resolvedPath) {
          skipped.push({ clipId, reason: 'No reachable file path was found for this clip.' });
          continue;
        }
        await requestEditor(`/projects/${projectId}/assets/from-path`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: resolvedPath,
            label: clip.title || clip.filename || clip.id,
            analyze: true,
            copyIntoProject: true,
          }),
        });
        sent.push({ clipId, resolvedPath });
      }

      const project = await requestEditor(`/projects/${projectId}`);
      return Response.json({
        success: true,
        sent,
        skipped,
        project: summarizeProject(project),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
