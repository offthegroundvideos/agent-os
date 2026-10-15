import { errorResponse, jsonResponse, osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: today's morning brief (written by the worker at 7am Pacific). POST: write a fresh one now.
export async function GET() {
  try {
    return jsonResponse({ brief: osWeb().runtime.brief.latest() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    return jsonResponse({ brief: await osWeb().runtime.brief.write() });
  } catch (error) {
    if (error?.name === 'RouterError') return jsonResponse({ error: 'No model is answering right now. Try again in a minute.' }, 503);
    return errorResponse(error);
  }
}
