import { errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonResponse(osWeb().dashboard.portfolioLibrary());
  } catch (error) {
    return errorResponse(error);
  }
}

// { id, lane?, style?, type?, location? } — the dashboard version of /tag.
export async function POST(request) {
  try {
    const { id, ...tags } = await readJson(request);
    const result = osWeb().dashboard.tagPortfolio(id, tags);
    return result.error ? jsonResponse({ error: result.error }, 400) : jsonResponse({ ok: true, item: result.item });
  } catch (error) {
    return errorResponse(error);
  }
}
