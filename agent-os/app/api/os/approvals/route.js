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
    if (op === 'add_page_link') {
      // Appends the prospect's page link to a waiting email, through the normal edit path.
      const current = runtime.approvals.waiting(id);
      const opportunityId = current.opportunityId || current.payload?.opportunityId;
      if (!opportunityId || !String(current.actionType).startsWith('email.')) return jsonResponse({ error: 'Only emails to a prospect can link a page.' }, 400);
      const base = runtime.sales.publicBase();
      if (!base) return jsonResponse({ error: 'Set the public address in Settings first.' }, 400);
      const draft = String(current.payload?.draft ?? '');
      if (draft.includes(`${base}/p/`)) return jsonResponse({ error: 'This email already links their page.' }, 400);
      const action = await runtime.approvals.revise(id, `${draft.trimEnd()}\n\n${runtime.sales.pitchPostscript(opportunityId)}`, { by });
      return jsonResponse({ ok: true, status: action.status, message: 'Page link added. It is still waiting for approval.' });
    }
    return jsonResponse({ error: 'op must be approve, reject, edit or add_page_link.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
