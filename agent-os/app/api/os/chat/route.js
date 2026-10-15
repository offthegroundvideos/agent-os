import { errorResponse, jsonResponse, osWeb, readJson } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_QUESTION = 2000;

// { question, history? } — the dashboard console. Same brain as free text in Telegram, read-only tools.
export async function POST(request) {
  try {
    const { question, history } = await readJson(request);
    const text = String(question ?? '').trim();
    if (!text) return jsonResponse({ error: 'Ask something first.' }, 400);
    if (text.length > MAX_QUESTION) return jsonResponse({ error: `Keep questions under ${MAX_QUESTION} characters.` }, 400);
    const started = Date.now();
    const { runtime } = osWeb();
    // "local": Gemma on this PC first (free). "claude": Claude first, Gemma as backup.
    const preferLocal = runtime.settings.get('chat.console_model') !== 'claude';
    const { answer, proposals } = await runtime.chat.converse(text, { channel: 'dashboard', history: Array.isArray(history) ? history : [], taskType: 'console', preferLocal });
    // Proposals never act; the page shows confirm buttons that call the normal approval and control routes.
    return jsonResponse({ answer, proposals, ms: Date.now() - started });
  } catch (error) {
    if (error?.name === 'RouterError') return jsonResponse({ error: 'No model is answering right now (Ollama and Claude both failed). Try again in a minute.' }, 503);
    return errorResponse(error);
  }
}
