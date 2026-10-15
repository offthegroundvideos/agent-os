import { actorFor, errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// { op: 'pause' | 'resume' } — the dashboard's /pause and /resume. Anyone who can approve can pause, as in Telegram.
export async function POST(request) {
  try {
    const { op } = await readJson(request);
    if (!['pause', 'resume'].includes(op)) return jsonResponse({ error: 'op must be pause or resume.' }, 400);
    const { runtime } = osWeb();
    runtime.settings.set('os.paused', op === 'pause');
    const by = actorFor(request);
    const message = op === 'pause' ? `⏸ Paused by ${by}. Nothing outgoing will run until you resume.` : `▶️ Running again (${by}).`;
    try {
      await runtime.notifier.alert(message);
    } catch (error) {
      console.error(`[otg-os web] could not tell Telegram: ${error.message}`);
    }
    return jsonResponse({ ok: true, paused: op === 'pause', message });
  } catch (error) {
    return errorResponse(error);
  }
}
