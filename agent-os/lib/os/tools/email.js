// lib/os/tools/email.js
// Registry tools for outreach email. Once Gmail accepts a message nothing in execute() may throw:
// a throw makes the registry retry, and a retry would send the same email twice.
import { emailFooter, laneHealth, nextSendingTime, sendBlock } from '../gigs/compliance.js';

const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

export function createEmailTools({ gmail, store, stages, settings, senderEmail, mailingAddress, notifier = null, now = () => new Date(), log = console.error }) {
  const footer = () => emailFooter({ senderName: settings.get('outreach.sender_name'), mailingAddress });

  function describe(payload) {
    return [
      `${payload.business} · ${payload.to}`,
      `Subject: ${payload.subject}`,
      '',
      payload.draft,
      footer(),
      ...(payload.needsReview ? ['', '⚠️ Drafted by the local model; read it carefully.'] : []),
    ].join('\n');
  }

  function notBefore(kind) {
    return async (payload) => {
      const opp = store.getOpportunity(payload.opportunityId);
      if (!opp) return null;
      const date = now();
      const block = sendBlock({ store, settings, lane: opp.lane, kind });
      if (block) return new Date(date.getTime() + block.waitHours * 3_600_000);
      const at = nextSendingTime(date, opp.business.timezone, settings.get('outreach.window'));
      return at.getTime() > date.getTime() ? at : null;
    };
  }

  // Runs bookkeeping that must never fail the action; problems are logged instead.
  function safely(label, fn) {
    try {
      fn();
    } catch (error) {
      try {
        log(`${label}: ${error?.message ?? error}`);
      } catch {
        // Logging must not throw either.
      }
    }
  }

  async function checkLaneHealth(lane) {
    const problem = laneHealth(store.laneSendStats(lane));
    const paused = settings.get('outreach.paused_lanes');
    if (!problem || paused[lane]) return;
    settings.set('outreach.paused_lanes', { ...paused, [lane]: problem });
    await notifier?.alert(`Paused ${lane} outreach: ${problem}. Check the list, then /lane resume ${lane}.`);
  }

  async function deliver(payload, kind, action) {
    const opp = store.getOpportunity(payload.opportunityId);
    if (!opp) throw new Error(`Opportunity not found: ${payload.opportunityId}`);
    if (store.isSuppressed(payload.to)) return { opp, skipped: 'on the do-not-contact list' };
    const mode = settings.get('outreach.mode') === 'send' ? 'send' : 'draft';
    const message = {
      from: `${settings.get('outreach.sender_name')} <${senderEmail}>`,
      to: payload.to,
      subject: payload.subject,
      text: `${payload.draft}\n${footer()}`,
      threadId: payload.threadId || undefined,
      inReplyTo: payload.inReplyTo || '',
    };
    const sent = mode === 'send' ? await gmail.send(message) : await gmail.createDraft(message);
    // Gmail has the message now. Nothing below may throw, or the registry would retry and send it twice.
    try {
      store.recordEmailSend({ opportunityId: opp.id, actionId: action.id, lane: opp.lane, kind, toEmail: payload.to, mode, gmailMessageId: sent.id, gmailThreadId: sent.threadId });
      if (mode === 'send') await checkLaneHealth(opp.lane);
    } catch (error) {
      safely('email bookkeeping', () => { throw error; });
    }
    return { opp, mode, sent };
  }

  const pitch = {
    name: 'email.pitch',
    actionType: 'email.first_contact',
    describe,
    notBefore: notBefore('pitch'),
    async execute(payload, { action }) {
      const result = await deliver(payload, 'pitch', action);
      if (result.skipped) {
        safely('pitch skipped', () => stages.move(result.opp.id, 'closed_unsubscribed', { reason: result.skipped, patch: { close_reason: 'suppressed' } }));
        return { skipped: result.skipped };
      }
      safely('pitch bookkeeping', () => {
        const days = settings.get('outreach.follow_up_days');
        stages.move(result.opp.id, 'pitched', {
          reason: result.mode === 'send' ? 'first email sent' : 'first email saved as a Gmail draft',
          patch: {
            gmail_thread_id: result.sent.threadId,
            subject: payload.subject,
            last_message_id_header: result.sent.messageIdHeader ?? '',
            pitched_at: now().toISOString(),
            next_follow_up_at: days.length ? addDays(now(), days[0]).toISOString() : null,
          },
        });
        store.recordPortfolioSends(result.opp.id, action.id, payload.portfolioIds ?? []);
      });
      return { mode: result.mode, messageId: result.sent.id, threadId: result.sent.threadId };
    },
  };

  const followUp = {
    name: 'email.follow_up',
    actionType: 'email.follow_up',
    describe,
    notBefore: notBefore('follow_up'),
    async execute(payload, { action }) {
      const opp = store.getOpportunity(payload.opportunityId);
      if (!opp || !['pitched', 'following_up'].includes(opp.stage)) return { skipped: `opportunity is ${opp?.stage ?? 'missing'}` };
      const result = await deliver(payload, 'follow_up', action);
      if (result.skipped) return { skipped: result.skipped };
      const number = opp.followUpsSent + 1;
      safely('follow-up bookkeeping', () => {
        const days = settings.get('outreach.follow_up_days');
        const next = number < days.length
          ? new Date(Math.max(addDays(new Date(opp.pitchedAt ?? now()), days[number]).getTime(), addDays(now(), 2).getTime()))
          : addDays(now(), settings.get('outreach.close_after_days'));
        const patch = { follow_ups_sent: number, next_follow_up_at: next.toISOString(), last_message_id_header: result.sent.messageIdHeader || opp.lastMessageIdHeader };
        if (opp.stage === 'pitched') stages.move(opp.id, 'following_up', { reason: `follow-up ${number} ${result.mode === 'send' ? 'sent' : 'drafted'}`, patch });
        else stages.update(opp.id, patch);
      });
      return { mode: result.mode, messageId: result.sent.id, number };
    },
  };

  const portfolioReply = {
    name: 'email.portfolio',
    actionType: 'email.portfolio_send',
    describe,
    notBefore: notBefore('portfolio'),
    async execute(payload, { action }) {
      const opp = store.getOpportunity(payload.opportunityId);
      if (opp?.stage !== 'replied') return { skipped: `opportunity is ${opp?.stage ?? 'missing'}` };
      const result = await deliver(payload, 'portfolio', action);
      if (result.skipped) return { skipped: result.skipped };
      safely('portfolio bookkeeping', () => {
        stages.move(opp.id, 'portfolio_sent', { reason: 'examples sent', patch: { last_message_id_header: result.sent.messageIdHeader || opp.lastMessageIdHeader } });
        store.recordPortfolioSends(opp.id, action.id, payload.portfolioIds ?? []);
      });
      return { mode: result.mode, messageId: result.sent.id };
    },
  };

  return [pitch, followUp, portfolioReply];
}
