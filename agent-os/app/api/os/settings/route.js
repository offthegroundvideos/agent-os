import { LANES } from '../../../../lib/os/gigs/constants.js';
import { actorFor, errorResponse, isOwnerRequest, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { dashboard, editor } = osWeb();
    return jsonResponse({ ...dashboard.settingsView(editor), canEdit: isOwnerRequest(request) });
  } catch (error) {
    return errorResponse(error);
  }
}

// Owner only. { op: 'set', key, value } | { op: 'lane', lane, active?, queries? } | { op: 'pauseLane', lane, paused }
export async function POST(request) {
  try {
    if (!isOwnerRequest(request)) {
      return jsonResponse({ error: 'Only the owner can change settings. Open the dashboard on the OTG-OS PC, or enter the access key.' }, 403);
    }
    const body = await readJson(request);
    const { runtime, editor } = osWeb();
    if (body.op === 'set') {
      editor.update(body.key, body.value);
      return jsonResponse({ ok: true, message: 'Saved.' });
    }
    if (body.op === 'lane') {
      editor.updateLane(body.lane, { active: body.active, queries: body.queries });
      return jsonResponse({ ok: true, message: 'Saved.' });
    }
    if (body.op === 'pauseLane') {
      // The same call /lane pause|resume makes.
      if (!LANES.includes(body.lane)) return jsonResponse({ error: `Lanes are: ${LANES.join(', ')}` }, 400);
      const message = runtime.gigs.setLanePaused(body.lane, body.paused ? `paused by ${actorFor(request)}` : null);
      return jsonResponse({ ok: true, message });
    }
    return jsonResponse({ error: 'op must be set, lane or pauseLane.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
