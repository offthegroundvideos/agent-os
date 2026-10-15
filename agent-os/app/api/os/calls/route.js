import { actorFor, errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Discovery calls for the closers, and recording how each one went.
export async function GET() {
  try {
    const { sales } = osWeb().runtime;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    return jsonResponse({ calls: sales.calls(), summary: sales.summary(since), closers: sales.closers(), publicBase: sales.publicBase() });
  } catch (error) {
    return errorResponse(error);
  }
}

// { id, status: 'held' | 'no_show' | 'cancelled', notes }
export async function POST(request) {
  try {
    const { id, status, notes } = await readJson(request);
    return jsonResponse({ ok: true, call: await osWeb().runtime.sales.setOutcome(id, { status, notes, actor: actorFor(request) }) });
  } catch (error) {
    return errorResponse(error);
  }
}
