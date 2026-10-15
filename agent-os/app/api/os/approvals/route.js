import { actorFor, errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonResponse(osWeb().dashboard.pendingApprovals());
  } catch (error) {
    return errorResponse(error);
  }
}

// { id, op: 'approve' | 'reject' | 'edit', reason?, text? } — the same three actions as the Telegram buttons.
export async function POST(request) {
  try {
    const { id, op, reason, text } = await readJson(request);
    const { runtime } = osWeb();
    const by = actorFor(request);
    if (!id || typeof id !== 'string') return jsonResponse({ error: 'id is required.' }, 400);
    if (op === 'approve') {
      const action = await runtime.approvals.approve(id, { by });
      return jsonResponse({ ok: true, status: action.status, message: `Approved by ${by}. It runs within a minute.` });
    }
    if (op === 'reject') {
      const { action, label } = await runtime.approvals.reject(id, { reason, by });
      return jsonResponse({ ok: true, status: action.status, message: `Rejected (${label}).` });
    }
    if (op === 'edit') {
      const action = await runtime.approvals.revise(id, text, { by });
      return jsonResponse({ ok: true, status: action.status, message: 'Saved. It is still waiting for approval.' });
    }
    return jsonResponse({ error: 'op must be approve, reject or edit.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
