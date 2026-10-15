import fs from 'node:fs';
import { Readable } from 'node:stream';
import { osWeb } from '../../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Streams the clip attached to this page, with range requests so phones can play and scrub it.
export async function GET(request, { params }) {
  const { token, id } = await params;
  const video = osWeb().runtime.sales.pageVideo(token, id);
  if (!video || !fs.existsSync(video.path)) return new Response('Not found', { status: 404 });
  const size = fs.statSync(video.path).size;
  const headers = { 'content-type': video.mime, 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600', 'x-robots-tag': 'noindex' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(video.path, { start, end }));
    return new Response(stream, { status: 206, headers: { ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}` } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(video.path)), { headers: { ...headers, 'content-length': String(size) } });
}
