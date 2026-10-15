// tests/osReplyTriage.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createReplyTriage, defaultCheckInDays, senderEmail } from '../lib/os/gigs/replyTriage.js';

function setup({ replies = [], bounces = [], messages = {}, verdicts = [], website = 'vineestate.com', settings, alertError = null } = {}) {
  const now = () => new Date('2026-10-14T17:00:00Z');
  const osDb = openOsDb(':memory:');
  const store = createGigStore(osDb, { now });
  const stages = createStages(osDb, { now });
  const { business } = store.upsertBusiness({ name: 'Vine Estate', lane: 'winery', website });
  const { opportunity } = store.createOpportunity(business.id);
  const contact = store.addContact(business.id, { email: 'events@vineestate.com', emailSourceUrl: 'https://vineestate.com/contact' });
  stages.move(opportunity.id, 'researched', { patch: { contact_id: contact.id } });
  stages.move(opportunity.id, 'pitched', { patch: { gmail_thread_id: 'th1', next_follow_up_at: '2026-10-18T17:00:00.000Z' } });
  store.recordEmailSend({ opportunityId: opportunity.id, actionId: 'a1', lane: 'winery', kind: 'pitch', toEmail: 'events@vineestate.com', mode: 'send' });
  const fetched = [];
  const queries = [];
  const gmail = {
    async search(query, max) {
      queries.push({ query, max });
      return (query.includes('mailer-daemon OR') ? bounces : replies).slice(0, max); // newest first, like Gmail
    },
    async getMessage(id) { fetched.push(id); return messages[id]; },
  };
  const tasks = [];
  const requests = [];
  const router = {
    async run(task, request) {
      tasks.push(task);
      requests.push(request);
      const next = verdicts.shift();
      if (next instanceof Error) throw next;
      return { text: JSON.stringify(next) };
    },
  };
  const drafted = [];
  const outreach = { async draftPortfolioReply(id, options) { drafted.push({ id, ...options }); return { actionId: 'act_p' }; } };
  const alerts = [];
  const logs = [];
  const triage = createReplyTriage({ gmail, store, stages, router, outreach, notifier: { alert: async (text) => { if (alertError) throw alertError; alerts.push(text); } }, settings, now, log: (line) => logs.push(line) });
  return { osDb, store, stages, triage, fetched, drafted, alerts, logs, tasks, requests, queries, verdicts, id: opportunity.id, gmail, outreach, now };
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

const memorySettings = (initial = '') => {
  const values = { 'gmail.last_success_at': initial };
  return { values, get: (key) => values[key], set: (key, value) => { values[key] = value; } };
};

test('a verdict after stray brackets is still found, and one failing suppress call does not stop the rest', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Unsubscribe me') } });
  let calls = 0;
  const store = { ...ctx.store, suppress(value, reason) { calls += 1; if (calls === 1) throw new Error('disk hiccup'); return ctx.store.suppress(value, reason); } };
  const router = { async run() { return { text: 'Thinking [1] {"note": 1} then {"label": "unsubscribe", "confidence": 0.9}' }; } };
  const triage = createReplyTriage({ gmail: ctx.gmail, store, stages: ctx.stages, router, outreach: {}, notifier: { alert: async (text) => ctx.alerts.push(text) }, now: ctx.now, log: (line) => ctx.logs.push(line) });
  assert.deepEqual(await triage.poll(), { checked: 1, handled: 1 });
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_unsubscribed');
  assert.match(ctx.logs[0], /could not suppress events@vineestate.com: disk hiccup/);
  assert.equal(ctx.store.isSuppressed('anyone@vineestate.com'), true);
  ctx.osDb.close();
});

test('only the new text of a reply is classified: quoted pitch and footer are cut', async () => {
  const body = 'Sounds great!\n\nOn Tue, Oct 14, 2026 at 5:00 PM Jack Riggs <jack@otg.com> wrote:\n> Hi Kim, we make films.\n> Reply "unsubscribe" to stop.';
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: { ...reply('r1', body), snippet: 'Sounds great! On Tue, Oct 14 Jack wrote: Hi Kim' } }, verdicts: [{ label: 'interested', confidence: 0.9 }] });
  await ctx.triage.poll();
  const content = ctx.requests[0].messages[0].content;
  assert.match(content, /Sounds great!/);
  assert.doesNotMatch(content, /we make films|unsubscribe|wrote:/);
  assert.match(ctx.alerts[0], /"Sounds great!"/);
  ctx.osDb.close();
});

test('quote cutting handles Outlook headers, original-message rules, ">" lines and the unsubscribe footer', async () => {
  const cases = [
    ['Yes please\n\nFrom: Jack Riggs <jack@otg.com>\nSent: Tuesday\nWe make films', /Yes please/],
    ['Yes please\n-----Original Message-----\nWe make films', /Yes please/],
    ['Yes please\n> We make films', /Yes please/],
    ['Yes please\nReply "unsubscribe" to stop\nThanks, Kim', /Yes please\s+Thanks, Kim/],
  ];
  for (const [body, expected] of cases) {
    const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: { ...reply('r1', body), snippet: '' } }, verdicts: [{ label: 'interested', confidence: 0.9 }] });
    await ctx.triage.poll();
    const content = ctx.requests[0].messages[0].content;
    assert.match(content, expected);
    assert.doesNotMatch(content, /We make films|unsubscribe/);
    ctx.osDb.close();
  }
  // Nothing new left: fall back to the snippet.
  const empty = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: { ...reply('r1', '> only a quote'), snippet: 'Thanks!' } }, verdicts: [{ label: 'interested', confidence: 0.9 }] });
  await empty.triage.poll();
  assert.match(empty.requests[0].messages[0].content, /Thanks!/);
  empty.osDb.close();
});

test('alert quotes decode basic HTML entities', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: { ...reply('r1', 'What&#39;s the &quot;price&quot; &amp; &lt;timeline&gt;?'), snippet: '' } }, verdicts: [{ label: 'asks_price', confidence: 0.9 }] });
  await ctx.triage.poll();
  assert.match(ctx.alerts[0], /"What's the "price" & <timeline>\?"/);
  ctx.osDb.close();
});

test('three failed attempts record the message as unclassified, alert once and stop calling the model', async () => {
  const boom = new Error('Claude is down');
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Sounds good') }, verdicts: [boom, boom, boom, { label: 'interested', confidence: 0.9 }] });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 0 });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 0 });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.deepEqual(ctx.alerts, ["I couldn't read a reply from Vine Estate; please check Gmail."]);
  assert.equal(ctx.store.seenInbound('r1'), true);
  assert.deepEqual(await ctx.triage.poll(), { checked: 0, handled: 0 });
  assert.equal(ctx.tasks.length, 3);
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'pitched');
  ctx.osDb.close();
});

test('the message is recorded before the alert, so a failing alert cannot cause re-classification', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'What does it cost?') }, verdicts: [{ label: 'asks_price', confidence: 0.9 }, { label: 'asks_price', confidence: 0.9 }], alertError: new Error('Telegram down') });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.ok(ctx.logs.some((line) => /alert failed/.test(line)));
  assert.equal(ctx.store.seenInbound('r1'), true);
  assert.deepEqual(await ctx.triage.poll(), { checked: 0, handled: 0 });
  assert.equal(ctx.tasks.length, 1);
  ctx.osDb.close();
});

test('check_in_days is clamped to 1..365', async () => {
  for (const [asked, expected] of [[9999, 365], [0.2, 1]]) {
    const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Later') }, verdicts: [{ label: 'not_now', confidence: 0.9, check_in_days: asked }] });
    await ctx.triage.poll();
    assert.match(ctx.alerts[0], new RegExp(`check back in ${expected} days`));
    ctx.osDb.close();
  }
});

test('a delivery delay notice is recorded and changes nothing', async () => {
  const delay = { id: 'b1', threadId: 'other', from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Delay)', snippet: '', text: 'Gmail will retry. Your message to events@vineestate.com is delayed.', labelIds: ['INBOX'] };
  const ctx = setup({ bounces: [{ id: 'b1', threadId: 'other' }], messages: { b1: delay } });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'pitched');
  assert.equal(ctx.store.laneSendStats('winery').bounces, 0);
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), false);
  assert.equal(ctx.store.seenInbound('b1'), true);
  assert.equal(ctx.osDb.db.prepare("SELECT label FROM inbound_messages WHERE gmail_message_id = 'b1'").get().label, 'bounce_delay');
  ctx.osDb.close();
});

test('a real bounce also blocks the contact address, but not the domain', async () => {
  const hard = { id: 'b1', threadId: 'other', from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', snippet: '', text: 'Your message to events@vineestate.com could not be delivered.', labelIds: ['INBOX'] };
  const ctx = setup({ bounces: [{ id: 'b1', threadId: 'other' }], messages: { b1: hard } });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_bounced');
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), true);
  assert.equal(ctx.store.isSuppressed('other@vineestate.com'), false);
  ctx.osDb.close();
});

test('a low-confidence out-of-office is not trusted: the team is asked', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'I am away but call me about the quote') }, verdicts: [{ label: 'out_of_office', confidence: 0.5 }] });
  await ctx.triage.poll();
  assert.match(ctx.alerts[0], /not sure how to read it \(out_of_office, 50% sure\)/);
  ctx.osDb.close();
});

test('unsubscribe on a shared-host business never blocks the whole domain', async () => {
  const ctx = setup({ website: 'https://www.sothebysrealty.com/agent/jane', replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Remove me') }, verdicts: [{ label: 'unsubscribe', confidence: 0.95 }] });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_unsubscribed');
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), true);
  assert.equal(ctx.store.isSuppressed('someone@sothebysrealty.com'), false);
  ctx.osDb.close();
});

test('a low-confidence unsubscribe alerts a person and suppresses nothing', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Hmm, not sure about this') }, verdicts: [{ label: 'unsubscribe', confidence: 0.4 }] });
  await ctx.triage.poll();
  assert.match(ctx.alerts[0], /not sure how to read it \(unsubscribe, 40% sure\)/);
  assert.equal(ctx.store.isSuppressed('events@vineestate.com'), false);
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'replied');
  ctx.osDb.close();
});

test('a skipped portfolio draft alerts a person', async () => {
  const ctx = setup({ replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'Any wedding films?') }, verdicts: [{ label: 'wants_examples', confidence: 0.9, style: 'cinematic' }] });
  ctx.outreach.draftPortfolioReply = async () => ({ skipped: 'no contact' });
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.match(ctx.alerts[0], /couldn't draft a reply \(no contact\)/);
  ctx.osDb.close();
});

test('searches use after: from the last success (minus 1h), 3 days on a first run, never more than 30 days', async () => {
  const nowSeconds = Date.parse('2026-10-14T17:00:00Z') / 1000;
  const first = setup({ settings: memorySettings('') });
  await first.triage.poll();
  assert.equal(first.queries.length, 2);
  assert.match(first.queries[0].query, /mailer-daemon OR/);
  assert.ok(first.queries[0].query.includes(`after:${nowSeconds - 3 * 86400}`));
  assert.ok(first.queries[1].query.includes(`after:${nowSeconds - 3 * 86400}`));
  assert.doesNotMatch(first.queries[1].query, /in:inbox|newer_than/);
  assert.match(first.queries[1].query, /-from:me/);
  assert.equal(first.queries[1].max, 1000);
  first.osDb.close();

  const settings = memorySettings('2026-10-14T10:00:00.000Z');
  const next = setup({ settings });
  await next.triage.poll();
  assert.ok(next.queries[1].query.includes(`after:${Date.parse('2026-10-14T09:00:00Z') / 1000}`));
  assert.equal(settings.values['gmail.last_success_at'], '2026-10-14T17:00:00.000Z');
  next.osDb.close();

  const stale = setup({ settings: memorySettings('2026-01-01T00:00:00.000Z') });
  await stale.triage.poll();
  assert.ok(stale.queries[1].query.includes(`after:${nowSeconds - 30 * 86400}`));
  stale.osDb.close();
});

test('last success only moves when the searches worked, and a failing phase does not starve the other', async () => {
  const settings = memorySettings('2026-10-14T10:00:00.000Z');
  const ctx = setup({ settings, replies: [{ id: 'r1', threadId: 'th1' }], messages: { r1: reply('r1', 'What does it cost?') }, verdicts: [{ label: 'asks_price', confidence: 0.9 }] });
  const search = ctx.gmail.search;
  ctx.gmail.search = async (query, max) => { if (query.includes('mailer-daemon OR')) throw new Error('quota'); return search(query, max); };
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.ok(ctx.logs.some((line) => /bounce search: quota/.test(line)));
  assert.equal(settings.values['gmail.last_success_at'], '2026-10-14T10:00:00.000Z');
  ctx.osDb.close();
});

test('searches ask for up to 1000 replies and 200 bounces', async () => {
  const ctx = setup();
  await ctx.triage.poll();
  assert.equal(ctx.queries[0].max, 200);
  assert.equal(ctx.queries[1].max, 1000);
  ctx.osDb.close();
});

test('hitting a search cap logs it and keeps last success where it was', async () => {
  const settings = memorySettings('2026-10-14T10:00:00.000Z');
  const replies = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, threadId: `zz${i}` }));
  const ctx = setup({ replies, settings });
  const result = await ctx.triage.poll();
  assert.equal(result.checked, 1000);
  assert.ok(ctx.logs.some((line) => line === 'Search hit 1000 messages; older mail will be picked up as newer mail is recorded.'));
  assert.equal(settings.values['gmail.last_success_at'], '2026-10-14T10:00:00.000Z');
  ctx.osDb.close();
});

test('an old reply behind 249 newer messages is still triaged', async () => {
  const newer = Array.from({ length: 249 }, (_, i) => ({ id: `u${i}`, threadId: `zz${i}` }));
  const ctx = setup({
    replies: [...newer, { id: 'r1', threadId: 'th1' }],
    messages: { r1: reply('r1', 'What would a harvest film cost?') },
    verdicts: [{ label: 'asks_price', confidence: 0.9 }],
  });
  const result = await ctx.triage.poll();
  assert.deepEqual(result, { checked: 250, handled: 1 });
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'replied');
  ctx.osDb.close();
});

test('a bounce notice that cannot be read three times is given up on with one alert', async () => {
  const ctx = setup({ bounces: [{ id: 'b1', threadId: 'other' }] });
  ctx.gmail.getMessage = async () => { throw new Error('Gmail 500'); };
  await ctx.triage.poll();
  await ctx.triage.poll();
  assert.deepEqual(ctx.alerts, []);
  assert.deepEqual(await ctx.triage.poll(), { checked: 1, handled: 1 });
  assert.deepEqual(ctx.alerts, ["I couldn't read a bounce notice; please check Gmail."]);
  assert.deepEqual(await ctx.triage.poll(), { checked: 0, handled: 0 });
  ctx.osDb.close();
});

test('a hard bounce that mentions "warning" in its body still closes the opportunity', async () => {
  const hard = { id: 'b1', threadId: 'other', from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)', snippet: '', text: 'Warning: your message to events@vineestate.com could not be delivered. The address does not exist.', labelIds: ['INBOX'] };
  const ctx = setup({ bounces: [{ id: 'b1', threadId: 'other' }], messages: { b1: hard } });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'closed_bounced');
  ctx.osDb.close();
});

test('delay notices are spotted by the body phrases too', async () => {
  const still = { id: 'b1', threadId: 'other', from: 'mailer-daemon@googlemail.com', subject: 'Undelivered Mail', snippet: '', text: 'The server is still trying to deliver your message to events@vineestate.com.', labelIds: ['INBOX'] };
  const ctx = setup({ bounces: [{ id: 'b1', threadId: 'other' }], messages: { b1: still } });
  await ctx.triage.poll();
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'pitched');
  ctx.osDb.close();
});

test('a poll that is already running is skipped', async () => {
  const ctx = setup({ replies: [{ id: 'u1', threadId: 'zz' }] });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const search = ctx.gmail.search;
  ctx.gmail.search = async (query, max) => { await gate; return search(query, max); };
  const first = ctx.triage.poll();
  assert.deepEqual(await ctx.triage.poll(), { skipped: 'already running' });
  release();
  assert.deepEqual(await first, { checked: 1, handled: 0 });
  assert.deepEqual(await ctx.triage.poll(), { checked: 0, handled: 0 });
  ctx.osDb.close();
});
