import { formatDollars } from '../budget.js';
import { approvalText, LEVEL_LABELS, REJECT_REASONS, rejectReasonKeyboard, truncate } from './format.js';

export const HELP_TEXT = [
  'OTG-OS commands:',
  '/status – running or paused, approvals waiting, failures',
  '/approvals – show everything waiting for you',
  '/budget – AI and data spend this month',
  '/pause – stop all outgoing actions now',
  '/resume – start again',
  '/cancel – cancel an edit in progress',
  'Anything else you type is a question for OTG-OS.',
].join('\n');

export function createTelegramBot({ api, ownerId, settings, ledger, registry, gate, budget, chat, log = console.error }) {
  const send = (chatId, text, keyboard) => api.sendMessage(chatId, truncate(text), keyboard);

  async function safeEdit(chatId, messageId, text) {
    if (!messageId) return;
    try {
      await api.editMessageText(chatId, messageId, truncate(text));
    } catch (error) {
      log(`Telegram edit failed: ${error.message}`);
    }
  }

  function statusText() {
    const spend = budget.status();
    return [
      settings.get('os.paused') ? '⏸ OTG-OS is paused.' : '▶️ OTG-OS is running.',
      `Approvals waiting: ${ledger.list({ status: 'proposed', limit: 100 }).length}`,
      `Failed actions: ${ledger.list({ status: 'failed', limit: 100 }).length}`,
      `Spend this month: ${formatDollars(spend.spentMicros)} of ${formatDollars(spend.capMicros)} (${spend.state})`,
    ].join('\n');
  }

  function budgetText() {
    const spend = budget.status();
    const caps = settings.get('budget.daily_tool_caps');
    return [
      `Spend this month: ${formatDollars(spend.spentMicros)} of ${formatDollars(spend.capMicros)} cap.`,
      `Warning at ${formatDollars(spend.warningMicros)}. State: ${spend.state}.`,
      ...Object.entries(caps).map(([tool, cap]) => `${tool}: ${budget.toolUnitsToday(tool)} of ${cap} today`),
    ].join('\n');
  }

  async function handleCallback(query) {
    const chatId = query.message?.chat?.id ?? ownerId;
    const messageId = query.message?.message_id;
    const [kind, target, extra] = String(query.data ?? '').split(':');
    try {
      if (kind === 'a') {
        await registry.approve(target);
        await safeEdit(chatId, messageId, `${query.message?.text ?? ''}\n\n✅ Approved. It runs within a minute.`);
        await api.answerCallbackQuery(query.id, 'Approved');
        return;
      }
      if (kind === 'r') {
        await send(chatId, 'Why are you rejecting it?', rejectReasonKeyboard(target));
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'rr') {
        const action = await registry.reject(target, { reason: extra });
        const label = REJECT_REASONS[extra] ?? 'Other';
        await safeEdit(chatId, messageId, `❌ Rejected (${label}).`);
        await safeEdit(chatId, action.telegramMessageId, `${approvalText(action, registry.describe(action))}\n\n❌ Rejected (${label}).`);
        await api.answerCallbackQuery(query.id, 'Rejected');
        return;
      }
      if (kind === 'e') {
        const action = ledger.get(target);
        if (!action || action.status !== 'proposed') throw new Error('That action is no longer waiting for approval.');
        settings.set('telegram.pending_edit_action_id', target);
        await send(chatId, 'Send the new text for this draft, or /cancel.');
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'p') {
        const policy = gate.promote(target);
        await safeEdit(chatId, messageId, `⬆️ ${target} now runs at ${LEVEL_LABELS[policy.level]}.`);
        await api.answerCallbackQuery(query.id, 'Promoted');
        return;
      }
      if (kind === 'k') {
        const policy = gate.declinePromotion(target);
        await safeEdit(chatId, messageId, `👍 ${target} stays at ${LEVEL_LABELS[policy.level]}.`);
        await api.answerCallbackQuery(query.id, 'Kept');
        return;
      }
      await api.answerCallbackQuery(query.id, 'Unknown button');
    } catch (error) {
      await api.answerCallbackQuery(query.id, String(error.message).slice(0, 190));
    }
  }

  async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = String(message.text ?? '').trim();
    if (!text) return;
    const command = text.startsWith('/') ? text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '') : '';
    const pendingEdit = settings.get('telegram.pending_edit_action_id');

    if (pendingEdit && !command) {
      settings.set('telegram.pending_edit_action_id', '');
      const before = ledger.get(pendingEdit);
      await safeEdit(chatId, before?.telegramMessageId, '✏️ Edited. The new version is below.');
      await registry.revise(pendingEdit, text);
      return;
    }

    switch (command) {
      case '/start':
      case '/help':
        await send(chatId, HELP_TEXT);
        return;
      case '/status':
        await send(chatId, statusText());
        return;
      case '/budget':
        await send(chatId, budgetText());
        return;
      case '/approvals': {
        const waiting = ledger.list({ status: 'proposed', limit: 20 }).reverse();
        if (!waiting.length) {
          await send(chatId, 'Nothing is waiting for you.');
          return;
        }
        for (const action of waiting) await registry.presentApproval(action);
        return;
      }
      case '/pause':
        settings.set('os.paused', true);
        await send(chatId, '⏸ Paused. Nothing outgoing will run until /resume.');
        return;
      case '/resume':
        settings.set('os.paused', false);
        await send(chatId, '▶️ Running again.');
        return;
      case '/cancel':
        settings.set('telegram.pending_edit_action_id', '');
        await send(chatId, 'Edit cancelled.');
        return;
      case '':
        break;
      default:
        await send(chatId, `I don't know ${command}.\n\n${HELP_TEXT}`);
        return;
    }

    try {
      await send(chatId, await chat.ask(text));
    } catch (error) {
      await send(chatId, `I can't answer right now: ${error.message}`);
    }
  }

  async function handleUpdate(update) {
    const from = update.message?.from ?? update.callback_query?.from;
    if (!from) return;
    if (!ownerId) {
      if (update.message) {
        await send(update.message.chat.id, `Your Telegram user ID is ${from.id}. Add TELEGRAM_OWNER_ID=${from.id} to .env.local and restart the OTG-OS worker.`);
      }
      return;
    }
    if (from.id !== ownerId) {
      log(`Ignored Telegram update from user ${from.id}`);
      return;
    }
    if (update.callback_query) return handleCallback(update.callback_query);
    if (update.message) return handleMessage(update.message);
  }

  async function pollOnce(timeoutSeconds = 25) {
    const updates = await api.getUpdates(settings.get('telegram.update_offset'), timeoutSeconds);
    for (const update of updates) {
      settings.set('telegram.update_offset', update.update_id + 1);
      try {
        await handleUpdate(update);
      } catch (error) {
        log(`Telegram update ${update.update_id} failed: ${error.message}`);
      }
    }
    return updates.length;
  }

  return { handleUpdate, pollOnce, statusText, budgetText };
}
