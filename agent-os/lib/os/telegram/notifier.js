import { approvalKeyboard, approvalText, LEVEL_LABELS, promotionKeyboard, truncate } from './format.js';

// Sends to every team member. One person's failed send (blocked bot, deleted chat) must not stop
// the others; it only throws when nobody could be reached.
export function createTelegramNotifier({ api, team, log = console.error }) {
  async function send(text, keyboard) {
    const members = team.members();
    const results = await Promise.allSettled(members.map((member) => api.sendMessage(member.id, truncate(text), keyboard)));
    const copies = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') copies.push({ chatId: members[index].id, messageId: result.value.message_id });
      else log(`Telegram send to ${members[index].name} failed: ${result.reason?.message ?? result.reason}`);
    });
    if (members.length && !copies.length) throw results[0].reason;
    return copies;
  }
  return {
    async requestApproval(action, description) {
      return send(approvalText(action, description), approvalKeyboard(action.id));
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
