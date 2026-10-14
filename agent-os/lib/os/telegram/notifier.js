import { approvalKeyboard, approvalText, LEVEL_LABELS, promotionKeyboard, truncate } from './format.js';

export function createTelegramNotifier({ api, ownerId }) {
  const send = (text, keyboard) => api.sendMessage(ownerId, truncate(text), keyboard);
  return {
    async requestApproval(action, description) {
      const message = await send(approvalText(action, description), approvalKeyboard(action.id));
      return message.message_id;
    },
    async tell(action, description) {
      await send(`✅ Done · ${action.actionType}\n\n${description}`);
    },
    async alert(text) {
      await send(`⚠️ ${text}`);
    },
    async offerPromotion({ actionType, from, to }) {
      await send(
        `I've had 20 approvals in a row with no edits for ${actionType}. Move it from ${LEVEL_LABELS[from]} to ${LEVEL_LABELS[to]}?`,
        promotionKeyboard(actionType),
      );
    },
  };
}

export function createConsoleNotifier(log = console.log) {
  return {
    async requestApproval(action, description) {
      log(`[approval needed] ${action.id} ${description}`);
      return null;
    },
    async tell(action, description) {
      log(`[done] ${action.actionType}: ${description}`);
    },
    async alert(text) {
      log(`[alert] ${text}`);
    },
    async offerPromotion({ actionType, from, to }) {
      log(`[promotion offer] ${actionType}: ${from} -> ${to}`);
    },
  };
}
