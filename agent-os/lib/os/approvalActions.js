// Approve, reject and edit a waiting action, and keep every Telegram copy of it in step.
// The Telegram bot and the dashboard both go through here, so an approval in one place shows in the other.
import { approvalText, REJECT_REASONS, truncate } from './telegram/format.js';

export class ApprovalError extends Error {}

export function createApprovalActions({ ledger, registry, api = null, log = console.error }) {
  async function safeEdit(chatId, messageId, text) {
    if (!api || !messageId) return;
    try {
      await api.editMessageText(chatId, messageId, truncate(text));
    } catch (error) {
      log(`Telegram edit failed: ${error.message}`);
    }
  }

  // Every member got their own copy of an approval; keep them all in step. Approvals sent before
  // copies were tracked fall back to the message whose button was pressed.
  async function editCopies(actionId, text, fallback = null) {
    const copies = ledger.telegramMessages(actionId);
    if (!copies.length && fallback) return safeEdit(fallback.chatId, fallback.messageId, text);
    for (const copy of copies) await safeEdit(copy.chatId, copy.messageId, text);
  }

  function waiting(actionId) {
    const action = ledger.get(actionId);
    if (!action || action.status !== 'proposed') throw new ApprovalError('That action is no longer waiting for approval.');
    return action;
  }

  // The text Telegram shows for an action; falls back to the draft when its tool isn't registered here.
  function describe(action) {
    try {
      return registry.describe(action);
    } catch {
      return String(action.payload?.draft ?? '');
    }
  }

  async function approve(actionId, { by, pressed = null }) {
    const action = await registry.approve(actionId, { by });
    await editCopies(actionId, `${approvalText(action, describe(action))}\n\n✅ Approved by ${by}. It runs within a minute.`, pressed);
    return action;
  }

  async function reject(actionId, { reason = 'other', by }) {
    const key = Object.hasOwn(REJECT_REASONS, reason) ? reason : 'other';
    const action = await registry.reject(actionId, { reason: key });
    const label = REJECT_REASONS[key];
    await editCopies(actionId, `${approvalText(action, describe(action))}\n\n❌ Rejected by ${by} (${label}).`);
    return { action, label };
  }

  async function revise(actionId, text, { by }) {
    const draft = String(text ?? '').trim();
    if (!draft) throw new ApprovalError('The new draft is empty.');
    waiting(actionId);
    await editCopies(actionId, `✏️ Edited by ${by}. The new version is below.`);
    return registry.revise(actionId, draft);
  }

  return { safeEdit, editCopies, waiting, describe, approve, reject, revise };
}
