import { actorFor, errorResponse, jsonResponse, osWeb, readJson } from '../../../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function view(sales, id) {
  const page = sales.pageFor(id);
  const videos = osWeb().runtime.osDb.db.prepare('SELECT id, title, mime, size, created_at AS createdAt FROM videos WHERE opportunity_id = ? ORDER BY id DESC').all(id).map((row) => ({ ...row }));
  return {
    publicBase: sales.publicBase(),
    page: page ? {
      token: page.token, url: sales.publicUrl(page.token), path: `/p/${page.token}`, intro: page.intro, views: page.views,
      lastViewedAt: page.last_viewed_at, videoId: page.video_id, active: page.active === 1,
    } : null,
    videos,
    timeline: sales.timeline(id),
    deal: sales.deal(id),
    calls: sales.calls().filter((call) => call.opportunityId === id),
    closers: sales.closers(),
  };
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const { sales, gigStore } = osWeb().runtime;
    if (!gigStore.getOpportunity(id)) return jsonResponse({ error: 'Prospect not found.' }, 404);
    return jsonResponse(view(sales, id));
  } catch (error) {
    return errorResponse(error);
  }
}

// { op: 'page' } | { op: 'intro', intro } | { op: 'active', active } | { op: 'video', videoId } | { op: 'touch', kind, note } | { op: 'deal', status, monthly, notes, closer }
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    const { sales } = osWeb().runtime;
    const actor = actorFor(request);
    switch (body.op) {
      case 'page': sales.ensurePage(id); break;
      case 'intro': sales.updatePage(id, { intro: body.intro }); break;
      case 'active': sales.updatePage(id, { active: Boolean(body.active) }); break;
      case 'video': sales.updatePage(id, { videoId: body.videoId == null ? null : Number(body.videoId) }); break;
      case 'touch': sales.logManual(id, { kind: body.kind, note: body.note, actor }); break;
      case 'deal': sales.setDeal(id, {
        status: body.status,
        monthlyCents: body.monthly === undefined || body.monthly === '' ? undefined : Math.round(Number(body.monthly) * 100),
        notes: body.notes,
        closer: body.closer,
      }, { actor }); break;
      default: return jsonResponse({ error: 'Unknown op.' }, 400);
    }
    return jsonResponse({ ok: true, ...view(sales, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
