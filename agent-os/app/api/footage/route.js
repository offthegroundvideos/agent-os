import fs from 'fs';
import path from 'path';
import { createSourceMedia } from '../../../lib/mediaIntelligence.js';

const LIBRARY_FILE = path.join(process.cwd(), 'data', 'footage', 'library.json');

const CATEGORIES = [
  'wedding', 'music-video', 'corporate', 'parade',
  'cultural-event', 'event-highlight', 'boating-yacht',
  'travel-destination', 'tourism', 'drone-aerial',
  'documentary', 'boudoir', 'real-estate',
  'stock-footage', 'behind-the-scenes', 'nature',
];

const LOCATIONS = [
  'New Orleans', 'Bora Bora', 'Caribbean', 'Hawaii',
  'Santorini', 'Tuscany', 'Tulum', 'Miami',
  'New York', 'Los Angeles', 'International', 'Local',
];

function loadLibrary() {
  try {
    if (!fs.existsSync(LIBRARY_FILE)) {
      fs.writeFileSync(LIBRARY_FILE, JSON.stringify({ clips: [], collections: [], lastUpdated: null }, null, 2));
    }
    return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
  } catch {
    return { clips: [], collections: [], lastUpdated: null };
  }
}

function saveLibrary(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(data, null, 2));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const query = searchParams.get('query');
  const category = searchParams.get('category');
  const location = searchParams.get('location');
  const stockOnly = searchParams.get('stockOnly');
  const clipId = searchParams.get('clipId');

  const library = loadLibrary();

  if (action === 'meta') {
    return Response.json({
      totalClips: library.clips.length,
      totalCollections: library.collections.length,
      categories: CATEGORIES,
      locations: LOCATIONS,
      stockClips: library.clips.filter(c => c.isStock).length,
      lastUpdated: library.lastUpdated,
      categoryBreakdown: CATEGORIES.map(cat => ({
        category: cat,
        count: library.clips.filter(c => c.categories?.includes(cat)).length,
      })).filter(c => c.count > 0),
    });
  }

  if (action === 'clip' && clipId) {
    const clip = library.clips.find(c => c.id === clipId);
    return Response.json(clip || { error: 'Clip not found' });
  }

  if (action === 'collections') {
    return Response.json(library.collections);
  }

  // Search and filter
  let clips = library.clips;

  if (query) {
    const q = query.toLowerCase();
    clips = clips.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.tags?.some(t => t.toLowerCase().includes(q)) ||
      c.location?.toLowerCase().includes(q) ||
      c.categories?.some(cat => cat.toLowerCase().includes(q))
    );
  }

  if (category) {
    clips = clips.filter(c => c.categories?.includes(category));
  }

  if (location) {
    clips = clips.filter(c => c.location?.toLowerCase().includes(location.toLowerCase()));
  }

  if (stockOnly === 'true') {
    clips = clips.filter(c => c.isStock === true);
  }

  return Response.json({
    clips,
    total: clips.length,
    categories: CATEGORIES,
    locations: LOCATIONS,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const library = loadLibrary();

    if (action === 'addClip') {
      const sourceMedia = createSourceMedia({
        client_id: body.client_id || 'cli_default',
        type: 'video',
        storage_uri: body.filepath || body.filename || '',
        duration_sec: Number(body.duration_sec || 0),
        orientation: body.orientation || 'landscape',
        ingest_status: 'uploaded',
        checksum: body.checksum || '',
        captured_at: body.shootDate || new Date().toISOString(),
        title: body.title || 'Untitled Clip',
        filename: body.filename || '',
        location: body.location || '',
        categories: body.categories || [],
        tags: body.tags || [],
        addedBy: body.addedBy || 'Jack',
      });

      const clip = {
        id: 'clip-' + Date.now(),
        sourceMediaId: sourceMedia.id,
        title: body.title || 'Untitled Clip',
        description: body.description || '',
        filename: body.filename || '',
        filepath: body.filepath || '',
        duration: body.duration || '',
        resolution: body.resolution || '',
        fps: body.fps || '',
        codec: body.codec || '',
        filesize: body.filesize || '',
        categories: body.categories || [],
        tags: body.tags || [],
        location: body.location || '',
        shootDate: body.shootDate || '',
        client: body.client || '',
        project: body.project || '',
        isStock: body.isStock || false,
        stockPrice: body.stockPrice || null,
        exclusivePrice: body.exclusivePrice || null,
        notes: body.notes || '',
        addedAt: new Date().toISOString(),
        addedBy: body.addedBy || 'Jack',
        status: body.status || 'raw',
      };

      library.clips.push(clip);
      saveLibrary(library);
      return Response.json({ success: true, clip, sourceMedia });
    }

    if (action === 'updateClip') {
      const idx = library.clips.findIndex(c => c.id === body.clipId);
      if (idx === -1) return Response.json({ error: 'Clip not found' }, { status: 404 });
      library.clips[idx] = { ...library.clips[idx], ...body.updates };
      saveLibrary(library);
      return Response.json({ success: true, clip: library.clips[idx] });
    }

    if (action === 'deleteClip') {
      library.clips = library.clips.filter(c => c.id !== body.clipId);
      saveLibrary(library);
      return Response.json({ success: true });
    }

    if (action === 'addCollection') {
      const collection = {
        id: 'collection-' + Date.now(),
        name: body.name || 'New Collection',
        description: body.description || '',
        category: body.category || '',
        location: body.location || '',
        clipIds: body.clipIds || [],
        isStock: body.isStock || false,
        coverClipId: body.coverClipId || null,
        createdAt: new Date().toISOString(),
        createdBy: body.createdBy || 'Jack',
      };

      library.collections.push(collection);
      saveLibrary(library);
      return Response.json({ success: true, collection });
    }

    if (action === 'bulkAdd') {
      const clips = body.clips || [];
      const added = [];
      for (const clipData of clips) {
        const sourceMedia = createSourceMedia({
          client_id: clipData.client_id || 'cli_default',
          type: 'video',
          storage_uri: clipData.filepath || clipData.filename || '',
          duration_sec: Number(clipData.duration_sec || 0),
          orientation: clipData.orientation || 'landscape',
          ingest_status: 'uploaded',
          checksum: clipData.checksum || '',
          captured_at: clipData.shootDate || new Date().toISOString(),
          title: clipData.title || 'Untitled Clip',
          filename: clipData.filename || '',
          location: clipData.location || '',
          categories: clipData.categories || [],
          tags: clipData.tags || [],
          addedBy: clipData.addedBy || 'Jack',
        });
        const clip = {
          id: 'clip-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          ...clipData,
          sourceMediaId: sourceMedia.id,
          addedAt: new Date().toISOString(),
        };
        library.clips.push(clip);
        added.push(clip);
      }
      saveLibrary(library);
      return Response.json({ success: true, added: added.length });
    }

    if (action === 'markAsStock') {
      const clip = library.clips.find(c => c.id === body.clipId);
      if (!clip) return Response.json({ error: 'Clip not found' }, { status: 404 });
      clip.isStock = true;
      clip.stockPrice = body.stockPrice || 49;
      clip.exclusivePrice = body.exclusivePrice || 299;
      saveLibrary(library);
      return Response.json({ success: true, clip });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
