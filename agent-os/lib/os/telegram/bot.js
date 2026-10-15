import { createApprovalActions } from '../approvalActions.js';
import { formatDollars } from '../budget.js';
import { OUTREACH_MODES } from '../settingsEditor.js';
import { LEVEL_LABELS, rejectReasonKeyboard, truncate } from './format.js';

export const HELP_TEXT = [
  'OTG-OS commands:',
  '/status – running or paused, approvals waiting, failures',
  '/approvals – show everything waiting for approval',
  '/pipeline – prospects and where each one is',
  '/portfolio – portfolio pieces and their tags',
  '/tag <number> lane=… style=… – correct a piece\'s tags',
  '/lane pause|resume <lane> – stop or restart outreach in one lane',
  '/mode draft|send – Gmail drafts only, or send after approval (owner only)',
  '/budget – AI and data spend this month',
  '/pause – stop all outgoing actions now',
  '/resume – start again',
  '/cancel – cancel an edit in progress',
  '/team – who can use this bot',
  '/remove <name> – take someone off the team (owner only)',
  'Anything else you type is a question for OTG-OS.',
].join('\n');

const NO_GIGS = "The Gig Engine isn't running yet.";

function displayName(from) {
  return String(from.first_name || from.username || `user ${from.id}`).trim();
}

export function createTelegramBot({
  api, team, settings, ledger, registry, gate, budget, chat, gigs = null, log = console.error,
  approvals = createApprovalActions({ ledger, registry, api, log }),
}) {
  const send = (chatId, text, keyboard) => api.sendMessage(chatId, truncate(text), keyboard);
  const owner = () => team.members().find((member) => member.role === 'owner') ?? null;
  const { safeEdit } = approvals;

  function pendingEdits() {
    return settings.get('telegram.pending_edits');
  }

  function setPendingEdit(userId, actionId) {
    const edits = pendingEdits();
    if (actionId) edits[String(userId)] = actionId;
    else delete edits[String(userId)];
    settings.set('telegram.pending_edits', edits);
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

  function teamText() {
    const lines = ['Team:', ...team.members().map((member) => `• ${member.name} (${member.role})`)];
    const waiting = team.pendingRequests();
    if (waiting.length) lines.push(`Waiting for access: ${waiting.map((request) => request.name).join(', ')}`);
    return lines.join('\n');
  }

  async function handleStranger(update, from) {
    if (update.callback_query) {
      await api.answerCallbackQuery(update.callback_query.id, "You don't have access to OTG-OS.");
      return;
    }
    const chatId = update.message.chat.id;
    const name = displayName(from);
    const { status } = team.requestAccess({ id: from.id, name });
    const boss = owner();
    if (status === 'requested') {
      await send(chatId, `I've asked ${boss.name} to let you in. You'll get a message here once that happens.`);
      const handle = from.username ? ` (@${from.username})` : '';
      await send(boss.id, `👤 ${name}${handle} wants access to OTG-OS (Telegram ID ${from.id}). They'd get the same approval rights you have.`, {
        inline_keyboard: [[
          { text: '✅ Let them in', callback_data: `ta:${from.id}` },
          { text: '🚫 Decline', callback_data: `td:${from.id}` },
        ]],
      });
      return;
    }
    if (status === 'already_requested') {
      await send(chatId, `Still waiting for ${boss.name} to let you in.`);
      return;
    }
    log(`Ignored Telegram message from ${from.id}: ${status}`);
  }

  async function handleCallback(query, member) {
    const chatId = query.message?.chat?.id ?? member.id;
    const messageId = query.message?.message_id;
    const pressed = { chatId, messageId };
    const [kind, target, extra] = String(query.data ?? '').split(':');
    try {
      if (kind === 'ta' || kind === 'td') {
        if (!team.isOwner(member.id)) {
          await api.answerCallbackQuery(query.id, `Only ${owner().name} can let people in.`);
          return;
        }
        if (kind === 'ta') {
          const added = team.approveRequest(Number(target));
          await safeEdit(chatId, messageId, `✅ ${added.name} is in, with the same approval rights as you. /remove ${added.name} takes them off.`);
          await send(added.id, `You're in. ${member.name} added you to OTG-OS.\n\n${HELP_TEXT}`);
          await api.answerCallbackQuery(query.id, 'Added');
        } else {
          const declined = team.denyRequest(Number(target));
          await safeEdit(chatId, messageId, `🚫 Declined ${declined.name}.`);
          await api.answerCallbackQuery(query.id, 'Declined');
        }
        return;
      }
      if (kind === 'a') {
        await approvals.approve(target, { by: member.name, pressed });
        await api.answerCallbackQuery(query.id, 'Approved');
        return;
      }
      if (kind === 'r') {
        await send(chatId, 'Why are you rejecting it?', rejectReasonKeyboard(target));
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'rr') {
        const { label } = await approvals.reject(target, { reason: extra, by: member.name });
        await safeEdit(chatId, messageId, `❌ Rejected (${label}).`);
        await api.answerCallbackQuery(query.id, 'Rejected');
        return;
      }
      if (kind === 'e') {
        approvals.waiting(target);
        setPendingEdit(member.id, target);
        await send(chatId, 'Send the new text for this draft, or /cancel.');
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'p') {
        const policy = gate.promote(target);
        await safeEdit(chatId, messageId, `⬆️ ${target} now runs at ${LEVEL_LABELS[policy.level]} (${member.name}).`);
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

  async function handleMessage(message, member) {
    const chatId = message.chat.id;
    const text = String(message.text ?? '').trim();
    if (!text) return;
    const [first, ...rest] = text.split(/\s+/);
    const command = text.startsWith('/') ? first.toLowerCase().replace(/@.*$/, '') : '';
    const pendingEdit = pendingEdits()[String(member.id)];

    if (pendingEdit && !command) {
      setPendingEdit(member.id, null);
      await approvals.revise(pendingEdit, text, { by: member.name });
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
      case '/team':
        await send(chatId, teamText());
        return;
      case '/remove': {
        if (!team.isOwner(member.id)) {
          await send(chatId, `Only ${owner().name} can remove people.`);
          return;
        }
        try {
          const removed = team.removeMember(rest.join(' '));
          setPendingEdit(removed.id, null);
          await send(chatId, `${removed.name} is off the team.`);
          try {
            await send(removed.id, 'Your OTG-OS access was removed.');
          } catch (error) {
            log(`Could not tell ${removed.name} they were removed: ${error.message}`);
          }
        } catch (error) {
          await send(chatId, error.message);
        }
        return;
      }
      case '/pipeline':
        await send(chatId, gigs ? gigs.pipelineText() : NO_GIGS);
        return;
      case '/portfolio':
        await send(chatId, gigs ? gigs.portfolioText() : NO_GIGS);
        return;
      case '/tag':
        await send(chatId, gigs ? gigs.tagPortfolio(rest) : NO_GIGS);
        return;
      case '/lane': {
        const [verb, lane] = rest;
        if (!gigs) {
          await send(chatId, NO_GIGS);
          return;
        }
        if (!['pause', 'resume'].includes(verb)) {
          await send(chatId, 'Use /lane pause <lane> or /lane resume <lane>.');
          return;
        }
        await send(chatId, gigs.setLanePaused(lane, verb === 'pause' ? `paused by ${member.name}` : null));
        return;
      }
      case '/mode': {
        if (!team.isOwner(member.id)) {
          await send(chatId, `Only ${owner().name} can change how emails go out.`);
          return;
        }
        const [mode] = rest;
        if (!OUTREACH_MODES.includes(mode)) {
          await send(chatId, `Emails are in ${settings.get('outreach.mode')} mode. Use /mode draft or /mode send.`);
          return;
        }
        settings.set('outreach.mode', mode);
        await send(chatId, mode === 'send'
          ? '📤 Approved emails now send from Gmail on their own, inside each recipient\'s 9-5 weekday window.'
          : '📝 Approved emails now become Gmail drafts for you to send.');
        return;
      }
      case '/approvals': {
        const waiting = ledger.list({ status: 'proposed', limit: 20 }).reverse();
        if (!waiting.length) {
          await send(chatId, 'Nothing is waiting for approval.');
          return;
        }
        for (const action of waiting) await registry.presentApproval(action);
        return;
      }
      case '/pause':
        settings.set('os.paused', true);
        await send(chatId, `⏸ Paused by ${member.name}. Nothing outgoing will run until /resume.`);
        return;
      case '/resume':
        settings.set('os.paused', false);
        await send(chatId, `▶️ Running again (${member.name}).`);
        return;
      case '/cancel':
        setPendingEdit(member.id, null);
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
    if (!owner()) {
      if (update.message) {
        await send(update.message.chat.id, `Your Telegram user ID is ${from.id}. Add TELEGRAM_OWNER_ID=${from.id} to .env.local and restart the OTG-OS worker.`);
      }
      return;
    }
    const member = team.get(from.id);
    if (!member) return handleStranger(update, from);
    if (update.callback_query) return handleCallback(update.callback_query, member);
    if (update.message) return handleMessage(update.message, member);
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
