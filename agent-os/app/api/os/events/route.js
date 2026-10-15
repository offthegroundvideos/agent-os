import { osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CHECK_MS = 2000;
const PING_MS = 20_000;

// Live updates: a server-sent event stream that says "change" whenever the dashboard data changes.
// The page reads it with fetch (not EventSource) so the access key can travel in a header, never in the URL.
export async function GET(request) {
  const { dashboard } = osWeb();
  const encoder = new TextEncoder();
  let check = null;
  let ping = null;
  const stop = () => {
    clearInterval(check);
    clearInterval(ping);
  };
  const stream = new ReadableStream({
    start(controller) {
      let last = '';
      const send = (chunk) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const look = () => {
        try {
          const now = dashboard.fingerprint();
          if (now === last) return;
          const first = !last;
          last = now;
          send(`event: ${first ? 'ready' : 'change'}\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
        } catch (error) {
          send(`event: problem\ndata: ${JSON.stringify({ message: String(error?.message ?? error) })}\n\n`);
        }
      };
      look();
      check = setInterval(look, CHECK_MS);
      ping = setInterval(() => send(': ping\n\n'), PING_MS);
      request.signal.addEventListener('abort', () => {
        stop();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel: stop,
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      // Keeps Next's gzip from buffering the stream.
      'content-encoding': 'none',
    },
  });
}
