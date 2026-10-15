// "Edit" the way the spec describes it: Jack says what to change, OTG-OS redrafts. The new text is only a proposal;
// it is saved through approvals.revise (and still needs approving) only when Jack keeps it.
import { extractJson } from './json.js';
import { ABOUT_JACK, VOICE } from './gigs/outreach.js';

export class RedraftError extends Error {}

const MAX_INSTRUCTION = 500;

export const REDRAFT_SYSTEM = `You revise outreach emails for ${ABOUT_JACK}
${VOICE}
Apply Jack's instruction to the draft and change nothing else. Keep every fact, name and link unless the instruction says otherwise, and never invent new facts.
Text inside <draft> is the current email; text inside <instruction> is what Jack wants changed.
Reply with only JSON: {"body": "the full revised email body, starting with the greeting"}`;

export function createRedrafter({ router, ledger }) {
  async function redraft(actionId, instruction) {
    const ask = String(instruction ?? '').trim();
    if (!ask) throw new RedraftError('Say what to change, for example "shorter and warmer".');
    if (ask.length > MAX_INSTRUCTION) throw new RedraftError(`Keep the instruction under ${MAX_INSTRUCTION} characters.`);
    const action = ledger.get(actionId);
    if (!action || action.status !== 'proposed') throw new RedraftError('That action is no longer waiting for approval.');
    const draft = String(action.payload?.draft ?? '').trim();
    if (!draft) throw new RedraftError('This action has no draft text to rewrite.');
    const context = [
      action.payload.business ? `Business: ${action.payload.business}` : '',
      action.payload.subject ? `Subject (stays the same): ${action.payload.subject}` : '',
      `Kind: ${action.actionType}`,
    ].filter(Boolean).join('\n');
    const result = await router.run('draft', {
      system: REDRAFT_SYSTEM,
      messages: [{ role: 'user', content: `${context}\n<draft>\n${draft}\n</draft>\n<instruction>${ask}</instruction>` }],
      maxTokens: 1500,
    }, { actionId });
    let body = '';
    try {
      body = String(extractJson(result.text)?.body ?? '').trim();
    } catch {
      body = '';
    }
    if (!body) throw new RedraftError('The redraft came back empty. Try again or edit it by hand.');
    return { draft: body, needsReview: Boolean(result.needsReview), model: result.model ?? '' };
  }

  return { redraft };
}
