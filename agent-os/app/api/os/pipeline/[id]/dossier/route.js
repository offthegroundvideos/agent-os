import { errorResponse, jsonResponse, osWeb } from '../../../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Builds (or rebuilds) the research brief for one prospect: a site read plus one Claude call, a few cents.
export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    return jsonResponse({ dossier: await osWeb().runtime.dossiers.build(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
