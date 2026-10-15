import { newText } from '../../../../../../lib/os/dossier.js';
import { errorResponse, jsonResponse, osWeb } from '../../../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The prospect's Gmail thread, read-only, newest words of each message only.
export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const { runtime } = osWeb();
    const opp = runtime.gigStore.getOpportunity(id);
    if (!opp) return jsonResponse({ error: 'Prospect not found.' }, 404);
    if (!opp.gmailThreadId) return jsonResponse({ messages: [], note: 'No email thread yet.' });
    if (!runtime.gmail?.fullThread) return jsonResponse({ messages: [], note: 'Gmail is not connected on this server.' });
    const thread = await runtime.gmail.fullThread(opp.gmailThreadId);
    const messages = thread.messages.map((message) => ({
      id: message.id,
      from: message.from,
      to: message.to,
      date: message.date,
      text: newText(message.text).slice(0, 4000),
      draft: message.labelIds.includes('DRAFT'),
      sent: message.labelIds.includes('SENT'),
    }));
    return jsonResponse({ messages, threadId: opp.gmailThreadId });
  } catch (error) {
    return errorResponse(error);
  }
}
