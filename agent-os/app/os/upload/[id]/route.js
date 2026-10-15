import { errorResponse, isAllowedRequest, jsonResponse, osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Clip upload for a prospect page. Lives outside /api so phone-sized videos aren't cut off by the proxy's body limit,
// and checks access itself the same way proxy.js does.
export async function POST(request, { params }) {
  if (!isAllowedRequest(request)) return jsonResponse({ error: 'This device needs the access key.' }, 401);
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get('video');
    if (!file || typeof file === 'string') return jsonResponse({ error: 'Choose a video first.' }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const video = await osWeb().runtime.sales.saveVideo(id, { bytes, mime: file.type || 'video/mp4', title: String(form.get('title') ?? file.name ?? '') });
    return jsonResponse({ ok: true, video: { id: video.id, title: video.title, size: video.size } });
  } catch (error) {
    return errorResponse(error);
  }
}
