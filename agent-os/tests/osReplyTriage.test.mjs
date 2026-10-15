// tests/osReplyTriage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createReplyTriage, defaultCheckInDays, senderEmail } from '../lib/os/gigs/replyTriage.js';

function setup({ replies = [], bounces = [], messages = {}, verdicts = [] } = {}) {
  const now = () => new Date('2026-10-14T17:00:00Z');
  const osDb = openOsDb(':memory:');
  const store = createGigStore(osDb, { now });
  const stages = createStages(osDb, { now });
  const { business } = store.upsertBusiness({ name: 'Vine Estate', lane: 'winery', website: 'vineestate.com' });
  const { opportunity } = store.createOpportunity(business.id);
  const contact = store.addContact(business.id, { email: 'events@vineestate.com', emailSourceUrl: 'https://vineestate.com/contact' });
  stages.move(opportunity.id, 'researched', { patch: { contact_id: contact.id } });
  stages.move(opportunity.id, 'pitched', { patch: { gmail_thread_id: 'th1', next_follow_up_at: '2026-10-18T17:00:00.000Z' } });
  store.recordEmailSend({ opportunityId: opportunity.id, actionId: 'a1', lane: 'winery', kind: 'pitch', toEmail: 'events@vineestate.com', mode: 'send' });
  const fetched = [];
  const gmail = {
    async search(query) { return query.includes('mailer-daemon OR') ? bounces : replies; },
    async getMessage(id) { fetched.push(id); return messages[id]; },
  };
  const tasks = [];
  const router = {
    async run(task) {
      tasks.push(task);
      const next = verdicts.shift();
      if (next instanceof Error) throw next;
      return { text: JSON.stringify(next) };
    },
  };
  const drafted = [];
  const outreach = { async draftPortfolioReply(id, options) { drafted.push({ id, ...options }); return { actionId: 'act_p' }; } };
  const alerts = [];
  const logs = [];
  const triage = createReplyTriage({ gmail, store, stages, router, outreach, notifier: { alert: async (text) => alerts.push(text) }, now, log: (line) => logs.push(line) });
  return { osDb, store, stages, triage, fetched, drafted, alerts, logs, tasks, verdicts, id: opportunity.id };
}

const reply = (id, text) => ({
  id, threadId: 'th1', from: 'Kim <Events@VineEstate.com>', subject: 'Re: Barrel room films', messageIdHeader: `<${id}@vine>`,
  snippet: text, text, labelIds: ['INBOX'],
});

test('helpers', () => {
  assert.equal(senderEmail('Kim <Events@VineEstate.com>'), 'events@vineestate.com');
  assert.equal(senderEmail('kim@vine.com'), 'kim@vine.com');
  assert.equal(defaultCheckInDays('travel', new Date('2026-10-14T17:00:00Z')), 60);
  assert.equal(defaultCheckInDays('winery', new Date('2026-10-14T17:00:00Z')), 291);
  assert.equal(defaultCheckInDays('winery', new Date('2027-03-01T00:00:00Z')), 153);
});

test('unrelated mail is never opened, and a request for examples drafts a portfolio reply once', async () => {
  const ctx = setup({
    replies: [{ id: 'u1', threadId: 'zz' }, { id: 'r1', threadId: 'th1' }],
    messages: { r1: reply('r1', 'Love it, do you have wedding films?') },
    verdicts: [{ label: 'wants_examples', confidence: 0.9, style: 'cinematic', summary: 'wants wedding examples' }],
  });
  assert.deepEqual(await ctx.triage.poll(), { checked: 2, handled: 1 });
  assert.deepEqual(ctx.fetched, ['r1']);
  assert.deepEqual(ctx.tasks, ['classify']);
  const opp = ctx.store.getOpportunity(ctx.id);
  assert.equal(opp.stage, 'replied');
  assert.equal(opp.nextFollowUpAt, null);
  assert.deepEqual(ctx.drafted, [{ id: ctx.id, style: 'cinematic', request: 'Love it, do you have wedding films?', inReplyTo: '<r1@vine>' }]);
  assert.match(ctx.alerts[0], /📁 Vine Estate asked for examples/);
  assert.deepEqual(await ctx.triage.poll(), { checked: 0, handled: 0 });
  assert.equal(ctx.fetched.length, 1);
  ctx.osDb.close();
});

test('unsubscribe blocks the sender, the contact and the whole domain', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Please remove me') }, verdicts: [{ label: 'unsubscribe', confidence: 0.95 }] });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_unsubscribed');
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), true);
  assert.equal(ctx.store.isSuppressed('someone@vineestate.com'), true);
  assert.equal(ctx.store.laneSendStats('winery').unsubscribes, 1);
  assert.match(ctx.alerts[0], /🚫 Vine Estate asked not to be emailed again/);
  ctx.osDb.close();
});

test('not now closes with a check-in date; no closes; unsure replies go to a person', async () => {
  const notNow = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Maybe after harvest') }, verdicts: [{ label: 'not_now', confidence: 0.9, check_in_days: null }] });
  await notNow.triage.poll();
  const opp = notNow.store.getOpportunity(notNow.id);
  assert.equal(opp.stage, 'closed_not_now');
  assert.match(opp.checkInAt, /^2027-08-01/);
  assert.match(notNow.alerts[0], /check back in 291 days/);
  notNow.osDb.close();

  const no = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'No thanks') }, verdicts: [{ label: 'no', confidence: 0.92 }] });
  await no.triage.poll();
  assert.equal(no.store.getOpportunity(no.id).stage, 'closed_no');
  no.osDb.close();

  const unsure = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Who is this?') }, verdicts: [{ label: 'interested', confidence: 0.6 }] });
  await unsure.triage.poll();
  assert.equal(unsure.store.getOpportunity(unsure.id).stage, 'replied');
  assert.match(unsure.alerts[0], /not sure how to read it \(interested, 60% sure\): "Who is this\?"/);
  unsure.osDb.close();
});

test('interested and price questions alert the team; out-of-office keeps follow-ups going', async () => {
  const hot = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'What would a harvest film cost?') }, verdicts: [{ label: 'asks_price', confidence: 0.9 }] });
  await hot.triage.poll();
  assert.equal(hot.store.getOpportunity(hot.id).stage, 'replied');
  assert.match(hot.alerts[0], /🔥 Vine Estate replied asking about price: "What would a harvest film cost\?"/);
  hot.osDb.close();

  const away = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Out until Monday') }, verdicts: [{ label: 'out_of_office', confidence: 0.99 }] });
  assert.deepEqual(await away.triage.poll(), { checked: 1, handled: 1 });
  const opp = away.store.getOpportunity(away.id);
  assert.equal(opp.stage, 'pitched');
  assert.equal(opp.nextFollowUpAt, '2026-10-18T17:00:00.000Z');
  assert.deepEqual(away.alerts, []);
  away.osDb.close();
});

test('bounces close the opportunity and count against the lane', async () => {
  const ctx = setup({
    bounces: [{ id: 'b1', threadId: 'other' }],
    messages: { b1: { id: 'b1', threadId: 'other', from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', snippet: '', text: 'Your message to events@vineestate.com could not be delivered.', labelIds: ['INBOX'] } },
  });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_bounced');
  assert.equal(ctx.store.laneSendStats('winery').bounces, 1);
  ctx.osDb.close();
});

test('a late reply after the follow-ups ran out reopens the conversation', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Sorry for the delay, still interested!') }, verdicts: [{ label: 'interested', confidence: 0.9 }] });
  ctx.stages.move(ctx.id, 'closed_lost', { patch: { close_reason: 'no_reply' } });
  await ctx.triage.poll();
  const opp = ctx.store.getOpportunity(ctx.id);
  assert.equal(opp.stage, 'replied');
  assert.equal(opp.closeReason, '');
  assert.match(ctx.alerts[0], /🔥 Vine Estate replied/);
  ctx.osDb.close();
});

test('a failed classification is retried on the next poll', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Sounds good') }, verdicts: [new Error('Claude is down'), { label: 'interested', confidence: 0.9 }] });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 0 });
  assert.match(ctx.logs[0], /reply triage r1: Claude is down/);
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  ctx.osDb.close();
});

test('a verdict after stray brackets is still found, and one bad suppress value does not stop the rest', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: { ...reply('r1', 'Unsubscribe me'), from: 'weird sender @ nowhere' } } });
  const gmail = {
    async search(query) { return query.includes('mailer-daemon OR') ? [] : [{ id: 'r1', threadId: 'th1' }]; },
    async getMessage() { return { ...reply('r1', 'Unsubscribe me'), from: 'weird sender @ nowhere' }; },
  };
  const router = { async run() { return { text: 'Thinking [1] {"note": 1} then {"label": "unsubscribe", "confidence": 0.9}' }; } };
  const triage = createReplyTriage({ gmail, store: ctx.store, stages: ctx.stages, router, outreach: {}, notifier: { alert: async (text) => ctx.alerts.push(text) }, now: () => new Date('2026-10-14T17:00:00Z'), log: (line) => ctx.logs.push(line) });
  assert.deepEqual(await triage.poll(), { checked: 1, handled: 1 });
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_unsubscribed');
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), true);
  assert.equal(ctx.store.isSuppressed('anyone@vineestate.com'), true);
  assert.match(ctx.logs[0], /could not suppress/);
  ctx.osDb.close();
});
