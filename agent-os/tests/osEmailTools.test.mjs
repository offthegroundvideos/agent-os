// tests/osEmailTools.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createEmailTools } from '../lib/os/tools/email.js';

function setup() {
  let t = Date.parse('2026-10-14T17:00:00Z'); // Wednesday 10:00 Pacific
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createGigStore(osDb, { now: clock.now });
  const stages = createStages(osDb, { now: clock.now });
  const { business } = store.upsertBusiness({ name: 'Vine Estate', lane: 'winery', website: 'vineestate.com' });
  const { opportunity } = store.createOpportunity(business.id);
  const contact = store.addContact(business.id, { email: 'events@vineestate.com', emailSourceUrl: 'https://vineestate.com/contact' });
  stages.move(opportunity.id, 'researched', { patch: { contact_id: contact.id } });
  const gmailCalls = [];
  const gmail = {
    async send(message) { gmailCalls.push(['send', message]); return { id: 's1', threadId: 'th-send', messageIdHeader: '<s1@mail>' }; },
    async createDraft(message) { gmailCalls.push(['draft', message]); return { id: 'd1', threadId: 'th-draft', messageIdHeader: '<d1@mail>' }; },
  };
  const alerts = [];
  const logs = [];
  const tools = createEmailTools({
    gmail, store, stages, settings, senderEmail: 'jack@madebyotg.com', mailingAddress: '21 Bolinas Rd, Fairfax, CA 94930',
    notifier: { alert: async (text) => alerts.push(text) }, now: clock.now, log: (line) => logs.push(line),
  });
  const [pitch, followUp, portfolio] = tools;
  const payload = { opportunityId: opportunity.id, business: 'Vine Estate', to: 'events@vineestate.com', subject: 'Barrel room films', draft: 'Hi Kim,\nIdea...', portfolioIds: [] };
  return { osDb, clock, settings, store, stages, gmail, gmailCalls, alerts, logs, pitch, followUp, portfolio, payload, id: opportunity.id };
}

const action = { id: 'act_1' };

test('tools have the right action types and the preview shows exactly what goes out', () => {
  const { osDb, pitch, followUp, portfolio, payload } = setup();
  assert.deepEqual([pitch, followUp, portfolio].map((tool) => tool.actionType), ['email.first_contact', 'email.follow_up', 'email.portfolio_send']);
  const preview = pitch.describe(payload);
  assert.match(preview, /^Vine Estate · events@vineestate.com\nSubject: Barrel room films\n\nHi Kim,/);
  assert.match(preview, /Reply "unsubscribe"/);
  assert.match(pitch.describe({ ...payload, needsReview: true }), /Drafted by the local model/);
  osDb.close();
});

test('notBefore waits for the recipient window, paused lanes and limits', async () => {
  const { osDb, clock, settings, pitch, payload } = setup();
  assert.equal(await pitch.notBefore(payload), null);
  clock.set('2026-10-15T02:00:00Z'); // Wed 19:00 Pacific
  assert.equal((await pitch.notBefore(payload)).toISOString(), '2026-10-15T16:00:00.000Z');
  clock.set('2026-10-14T17:00:00Z');
  settings.set('outreach.paused_lanes', { winery: 'bounce rate 9%' });
  assert.equal((await pitch.notBefore(payload)).toISOString(), '2026-10-14T23:00:00.000Z');
  osDb.close();
});

test('in draft mode a pitch becomes a Gmail draft and the opportunity is pitched', async () => {
  const { osDb, store, gmailCalls, pitch, payload, id } = setup();
  const result = await pitch.execute({ ...payload, portfolioIds: [] }, { action });
  assert.deepEqual(result, { mode: 'draft', messageId: 'd1', threadId: 'th-draft' });
  const [kind, message] = gmailCalls[0];
  assert.equal(kind, 'draft');
  assert.equal(message.from, 'Jack Riggs <jack@madebyotg.com>');
  assert.match(message.text, /^Hi Kim,\nIdea...\n\n--\nJack Riggs · OFF THE GROUND/);
  const opp = store.getOpportunity(id);
  assert.equal(opp.stage, 'pitched');
  assert.equal(opp.gmailThreadId, 'th-draft');
  assert.equal(opp.subject, 'Barrel room films');
  assert.equal(opp.nextFollowUpAt, '2026-10-18T17:00:00.000Z');
  assert.equal(store.emailsInLast24h({ kind: 'pitch' }), 1);
  osDb.close();
});

test('a suppressed address is never emailed and the opportunity closes', async () => {
  const { osDb, store, gmailCalls, pitch, payload, id } = setup();
  store.suppress('vineestate.com', 'unsubscribe');
  assert.deepEqual(await pitch.execute(payload, { action }), { skipped: 'on the do-not-contact list' });
  assert.equal(gmailCalls.length, 0);
  assert.equal(store.getOpportunity(id).stage, 'closed_unsubscribed');
  osDb.close();
});

test('bookkeeping failures after a send are logged, never thrown', async () => {
  const { osDb, stages, logs, pitch, payload } = setup();
  stages.move = () => { throw new Error('Cannot move opp (forced failure)'); };
  const result = await pitch.execute(payload, { action });
  assert.equal(result.mode, 'draft');
  assert.match(logs[0], /pitch bookkeeping: Cannot move/);
  osDb.close();
});

test('follow-ups send in the thread, advance the count and schedule the next one', async () => {
  const { osDb, clock, settings, store, gmailCalls, pitch, followUp, payload, id } = setup();
  settings.set('outreach.mode', 'send');
  await pitch.execute(payload, { action });
  clock.set('2026-10-18T17:00:00Z');
  const opp = store.getOpportunity(id);
  const result = await followUp.execute({ ...payload, subject: 'Re: Barrel room films', draft: 'Quick idea', threadId: opp.gmailThreadId, inReplyTo: opp.lastMessageIdHeader }, { action: { id: 'act_2' } });
  assert.deepEqual(result, { mode: 'send', messageId: 's1', number: 1 });
  assert.equal(gmailCalls[1][1].threadId, 'th-send');
  assert.equal(gmailCalls[1][1].inReplyTo, '<s1@mail>');
  const after = store.getOpportunity(id);
  assert.equal(after.stage, 'following_up');
  assert.equal(after.followUpsSent, 1);
  assert.equal(after.nextFollowUpAt, '2026-10-23T17:00:00.000Z');
  const skipped = await followUp.execute({ ...payload, opportunityId: 'opp_missing' }, { action });
  assert.match(skipped.skipped, /missing/);
  osDb.close();
});

test('too many bounces pause the lane and alert the team', async () => {
  const { osDb, settings, store, alerts, pitch, payload, id } = setup();
  settings.set('outreach.mode', 'send');
  for (let i = 0; i < 10; i += 1) {
    store.recordEmailSend({ opportunityId: id, actionId: `x${i}`, lane: 'winery', kind: 'pitch', toEmail: 'a@b.com', mode: 'send' });
  }
  store.markEmailOutcome(id, { bounced: true });
  await pitch.execute(payload, { action });
  assert.equal(settings.get('outreach.paused_lanes').winery, 'bounce rate 9% over the last 11 sends');
  assert.match(alerts[0], /Paused winery outreach/);
  osDb.close();
});

const addItems = (osDb, n) => {
  const ids = [];
  for (let i = 0; i < n; i += 1) {
    ids.push(Number(osDb.db.prepare("INSERT INTO portfolio_items (source, url, title, created_at, updated_at) VALUES ('manual', ?, 't', 'x', 'x')").run(`https://x.com/${i}`).lastInsertRowid));
  }
  return ids;
};

test('a pitch only goes to a researched prospect and missing ones are skipped before waiting', async () => {
  const { osDb, stages, gmailCalls, pitch, payload, id } = setup();
  stages.move(id, 'closed_lost');
  assert.deepEqual(await pitch.execute(payload, { action }), { skipped: 'opportunity is closed_lost' });
  assert.deepEqual(await pitch.execute({ ...payload, opportunityId: 'opp_missing' }, { action }), { skipped: 'opportunity is missing' });
  assert.equal(await pitch.notBefore({ ...payload, opportunityId: 'opp_missing' }), null);
  assert.equal(gmailCalls.length, 0);
  osDb.close();
});

test('running the same action twice calls Gmail once', async () => {
  const { osDb, settings, store, gmailCalls, pitch, payload, id } = setup();
  settings.set('outreach.mode', 'send');
  const first = await pitch.execute(payload, { action });
  // Simulate a crash after the send: the stage never moved.
  osDb.db.prepare("UPDATE opportunities SET stage = 'researched' WHERE id = ?").run(id);
  const second = await pitch.execute(payload, { action });
  assert.equal(gmailCalls.length, 1);
  assert.deepEqual(second, first);
  assert.equal(store.emailsInLast24h(), 1);
  assert.equal(store.getOpportunity(id).stage, 'pitched');
  assert.equal(store.emailForAction('nope'), null);
  osDb.close();
});

test('a suppressed follow-up or portfolio reply closes the opportunity', async () => {
  const a = setup();
  a.stages.move(a.id, 'pitched');
  a.store.suppress('events@vineestate.com', 'unsubscribe');
  assert.deepEqual(await a.followUp.execute(a.payload, { action }), { skipped: 'on the do-not-contact list' });
  assert.equal(a.store.getOpportunity(a.id).stage, 'closed_unsubscribed');
  assert.equal(a.gmailCalls.length, 0);
  a.osDb.close();
  const b = setup();
  b.stages.move(b.id, 'pitched');
  b.stages.move(b.id, 'replied');
  b.store.suppress('vineestate.com', 'unsubscribe');
  assert.deepEqual(await b.portfolio.execute(b.payload, { action }), { skipped: 'on the do-not-contact list' });
  assert.equal(b.store.getOpportunity(b.id).stage, 'closed_unsubscribed');
  b.osDb.close();
});

test('the contact address is checked for suppression too', async () => {
  const { osDb, store, gmailCalls, pitch, payload, id } = setup();
  store.suppress('events@vineestate.com', 'unsubscribe');
  assert.deepEqual(await pitch.execute({ ...payload, to: 'other@elsewhere.com' }, { action }), { skipped: 'on the do-not-contact list' });
  assert.equal(gmailCalls.length, 0);
  assert.equal(store.getOpportunity(id).stage, 'closed_unsubscribed');
  osDb.close();
});

test('an empty draft throws before Gmail is called', async () => {
  const { osDb, gmailCalls, pitch, payload } = setup();
  await assert.rejects(() => pitch.execute({ ...payload, draft: '   ' }, { action }), /Empty draft/);
  assert.equal(gmailCalls.length, 0);
  osDb.close();
});

test('a portfolio reply moves replied to portfolio_sent and records the pieces', async () => {
  const { osDb, stages, store, gmailCalls, portfolio, payload, id } = setup();
  stages.move(id, 'pitched');
  stages.move(id, 'replied');
  const ids = addItems(osDb, 2);
  const result = await portfolio.execute({ ...payload, portfolioIds: ids }, { action });
  assert.deepEqual(result, { mode: 'draft', messageId: 'd1' });
  assert.equal(gmailCalls.length, 1);
  assert.equal(store.getOpportunity(id).stage, 'portfolio_sent');
  assert.equal(osDb.db.prepare('SELECT COUNT(*) AS n FROM portfolio_sends WHERE opportunity_id = ?').get(id).n, 2);
  osDb.close();
});

test('a Gmail failure does no bookkeeping', async () => {
  const { osDb, gmail, store, pitch, payload, id } = setup();
  gmail.createDraft = async () => { throw new Error('Gmail 500'); };
  await assert.rejects(() => pitch.execute(payload, { action }), /Gmail 500/);
  assert.equal(store.getOpportunity(id).stage, 'researched');
  assert.equal(store.emailsInLast24h(), 0);
  osDb.close();
});
