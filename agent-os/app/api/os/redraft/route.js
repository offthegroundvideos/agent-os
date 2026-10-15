import { errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { id, instruction } → a proposed new draft. Nothing is saved; the page saves it through /api/os/approvals (op edit).
export async function POST(request) {
  try {
    const { id, instruction } = await readJson(request);
    if (!id || typeof id !== 'string') return jsonResponse({ error: 'id is required.' }, 400);
    return jsonResponse(await osWeb().runtime.redrafter.redraft(id, instruction));
  } catch (error) {
    return errorResponse(error);
  }
}
