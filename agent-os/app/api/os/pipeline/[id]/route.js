import { errorResponse, jsonResponse, osWeb } from '../../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const detail = osWeb().dashboard.opportunity(id);
    return detail ? jsonResponse(detail) : jsonResponse({ error: 'Opportunity not found.' }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
