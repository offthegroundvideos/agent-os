import {
  addCreator,
  addVideo,
  bulkImportVideos,
  buildPacket,
  getResearchSummary,
  getTopCreators,
  getVideos,
  normalizeVideo,
} from '../../../lib/viralResearch.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const filters = {
    niche: searchParams.get('niche') || '',
    platform: searchParams.get('platform') || '',
    platforms: searchParams.get('platforms') || '',
    query: searchParams.get('query') || '',
    creatorHandle: searchParams.get('creatorHandle') || '',
    qualifiesFiveX: searchParams.get('qualifiesFiveX') || '',
    freshOnly: searchParams.get('freshOnly') || '',
  };

  if (action === 'videos') return Response.json(getVideos(filters));
  if (action === 'creators') return Response.json(getTopCreators(filters, 20));
  if (action === 'packet') return Response.json(buildPacket(filters));
  return Response.json(getResearchSummary(filters));
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'addCreator') {
      const creator = addCreator(body.creator || body);
      return Response.json({ success: true, creator });
    }

    if (action === 'addVideo') {
      const video = addVideo(body.video || body);
      return Response.json({ success: true, video });
    }

    if (action === 'bulkImport') {
      const videos = Array.isArray(body.videos)
        ? body.videos
        : Object.values(body.resultsByPlatform || {}).flatMap(group => group?.videos || []);
      const added = bulkImportVideos(videos.map(item => normalizeVideo(item)));
      return Response.json({ success: true, added: added.length, videos: added });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
