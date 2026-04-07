import { addPublishedPost, addScript, listPublishedPosts, listScripts, updateScriptStatus } from '../../../lib/contentRecords.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'scripts';

  if (action === 'published_posts') {
    return Response.json(listPublishedPosts({
      content_asset_id: searchParams.get('content_asset_id') || '',
      client_id: searchParams.get('client_id') || '',
    }));
  }

  return Response.json(listScripts({
    asset_id: searchParams.get('asset_id') || '',
    client_id: searchParams.get('client_id') || '',
  }));
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'addScript') return Response.json({ success: true, script: addScript(body.script || body) });
    if (body.action === 'updateScriptStatus') return Response.json({ success: true, script: updateScriptStatus(body.id, body.approval_status, body) });
    if (body.action === 'addPublishedPost') return Response.json({ success: true, publishedPost: addPublishedPost(body.post || body) });
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
