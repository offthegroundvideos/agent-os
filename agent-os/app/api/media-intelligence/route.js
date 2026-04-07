import {
  SOURCE_MEDIA_STATES,
  addClipCandidate,
  createSourceMedia,
  getSourceMedia,
  listClipCandidates,
  listSourceMedia,
  transitionSourceMedia,
} from '../../../lib/mediaIntelligence.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'source_media';
  const id = searchParams.get('id') || '';
  const sourceMediaId = searchParams.get('source_media_id') || '';

  if (action === 'states') return Response.json({ sourceMediaStates: SOURCE_MEDIA_STATES });
  if (action === 'source_media' && id) {
    const media = getSourceMedia(id);
    return Response.json(media || { error: 'Not found' }, { status: media ? 200 : 404 });
  }
  if (action === 'clip_candidates') return Response.json(listClipCandidates({ source_media_id: sourceMediaId }));
  return Response.json(listSourceMedia());
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'createSourceMedia') {
      return Response.json({ success: true, sourceMedia: createSourceMedia(body.sourceMedia || body) });
    }
    if (body.action === 'transitionSourceMedia') {
      return Response.json({ success: true, sourceMedia: transitionSourceMedia(body.id, body.nextState, body) });
    }
    if (body.action === 'addClipCandidate') {
      return Response.json({ success: true, clipCandidate: addClipCandidate(body.clipCandidate || body) });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
