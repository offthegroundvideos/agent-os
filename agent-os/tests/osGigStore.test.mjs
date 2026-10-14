// tests/osGigStore.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { businessKey, createGigStore, domainOf, isSharedHost, normalizeEmail } from '../lib/os/gigs/store.js';

function setup() {
  let t = Date.parse('2026-10-14T16:00:00Z');
  const clock = { now: () => new Date(t), advance: (ms) => { t += ms; } };
  const osDb = openOsDb(':memory:');
  return { osDb, clock, store: createGigStore(osDb, { now: clock.now }) };
}

test('domainOf normalizes websites', () => {
  assert.equal(domainOf('https://www.Example-Winery.com/visit?x=1'), 'example-winery.com');
  assert.equal(domainOf('example.com'), 'example.com');
  assert.equal(domainOf('not a url'), '');
  assert.equal(domainOf('https://example.com./x'), 'example.com');
});

test('normalizeEmail extracts and cleans addresses', () => {
  assert.equal(normalizeEmail('Jane <Jane@X.com>'), 'jane@x.com');
  assert.equal(normalizeEmail('<jane@x.com>'), 'jane@x.com');
  assert.equal(normalizeEmail(' jane@x.com. '), 'jane@x.com');
  assert.equal(normalizeEmail('not-an-email@'), '');
  assert.equal(normalizeEmail(undefined), '');
  assert.equal(normalizeEmail('a@b'), '');
});

test('shared hosts are keyed by page path, everything else by domain', () => {
  assert.equal(isSharedHost('sothebysrealty.com'), true);
  assert.equal(isSharedHost('jane.wixsite.com'), true);
  assert.equal(isSharedHost('vinecellars.com'), false);
  assert.equal(businessKey('https://www.vinecellars.com/events'), 'vinecellars.com');
  assert.equal(businessKey('https://www.sothebysrealty.com/eng/associate/180-a-1234/jane-doe/'), 'sothebysrealty.com/eng/associate/180-a-1234/jane-doe');
  const { osDb, store } = setup();
  const jane = store.upsertBusiness({ name: 'Jane Doe', lane: 'real_estate', website: 'https://www.sothebysrealty.com/eng/associate/1/jane-doe' });
  const sam = store.upsertBusiness({ name: 'Sam Roe', lane: 'real_estate', website: 'https://www.sothebysrealty.com/eng/associate/2/sam-roe' });
  const janeAgain = store.upsertBusiness({ name: 'Jane Doe', lane: 'real_estate', website: 'sothebysrealty.com/eng/associate/1/jane-doe/' });
  assert.equal(jane.created && sam.created, true);
  assert.notEqual(jane.business.id, sam.business.id);
  assert.equal(janeAgain.created, false);
  assert.equal(jane.business.websiteDomain, 'sothebysrealty.com');
  osDb.close();
});

test('businesses are merged by domain and get one opportunity', () => {
  const { osDb, store } = setup();
  const first = store.upsertBusiness({ name: 'Vine Cellars', lane: 'winery', website: 'https://www.vinecellars.com', location: 'Napa, CA' });
  const again = store.upsertBusiness({ name: 'Vine Cellars Napa', lane: 'winery', website: 'vinecellars.com/events' });
  assert.equal(first.created, true);
  assert.equal(again.created, false);
  assert.equal(again.business.id, first.business.id);
  assert.equal(first.business.website, 'https://www.vinecellars.com');
  const opp = store.createOpportunity(first.business.id);
  assert.equal(opp.created, true);
  assert.equal(opp.opportunity.stage, 'found');
  assert.equal(opp.opportunity.business.name, 'Vine Cellars');
  assert.equal(store.createOpportunity(first.business.id).created, false);
  assert.throws(() => store.upsertBusiness({ name: 'X', lane: 'boats', website: 'x.com' }), /Unknown lane/);
  osDb.close();
});

test('contacts, thread and email lookups', () => {
  const { osDb, store } = setup();
  const { business } = store.upsertBusiness({ name: 'Bay Homes', lane: 'real_estate', website: 'bayhomes.com' });
  const { opportunity } = store.createOpportunity(business.id);
  const contact = store.addContact(business.id, { name: 'Ana', role: 'Agent', email: 'Ana@BayHomes.com ', emailSourceUrl: 'https://bayhomes.com/contact' });
  assert.equal(contact.email, 'ana@bayhomes.com');
  assert.equal(store.addContact(business.id, { email: 'ana@bayhomes.com', emailSourceUrl: 'x' }).id, contact.id);
  osDb.db.prepare("UPDATE opportunities SET contact_id = ?, gmail_thread_id = 'th1' WHERE id = ?").run(contact.id, opportunity.id);
  assert.equal(store.findByThread('th1').id, opportunity.id);
  assert.equal(store.findByContactEmail('ANA@bayhomes.com').id, opportunity.id);
  assert.equal(store.findByThread('nope'), null);
  assert.equal(store.findByThread(''), null);
  assert.equal(store.findByThread(null), null);
  assert.equal(store.findByContactEmail('Ana <ANA@bayhomes.com>').id, opportunity.id);
  assert.throws(() => store.addContact(business.id, { name: 'No email', emailSourceUrl: 'x' }), /email/i);
  assert.throws(() => store.addContact(business.id, { email: 'nope@', emailSourceUrl: 'x' }), /email/i);
  assert.deepEqual(store.stageCounts(), { found: 1 });
  osDb.close();
});

test('suppression covers the address and its whole domain', () => {
  const { osDb, store } = setup();
  store.suppress('Owner@Shop.com', 'unsubscribe');
  store.suppress('blocked.com', 'unsubscribe');
  assert.equal(store.isSuppressed('owner@shop.com'), true);
  assert.equal(store.isSuppressed('other@shop.com'), false);
  assert.equal(store.isSuppressed('anyone@blocked.com'), true);
  assert.equal(store.isSuppressed('blocked.com'), true);
  store.suppress('jane@x.com', 'unsubscribe');
  store.suppress('Shop.com.', 'unsubscribe');
  for (const form of ['Jane <Jane@X.com>', '<jane@x.com>', 'jane@x.com.', 'a@SHOP.com.']) assert.equal(store.isSuppressed(form), true, form);
  assert.equal(store.isSuppressed('not-an-email@'), true);
  store.suppress('Bob <BOB@y.com>', 'unsubscribe');
  assert.equal(store.isSuppressed('bob@y.com'), true);
  assert.throws(() => store.suppress('bad@', 'x'), /email/i);
  osDb.close();
});

test('email counts roll over 24 hours and lane stats only count real sends', () => {
  const { osDb, clock, store } = setup();
  const { business } = store.upsertBusiness({ name: 'Venue', lane: 'wedding', website: 'venue.com' });
  const { opportunity } = store.createOpportunity(business.id);
  const send = (kind, mode) => store.recordEmailSend({ opportunityId: opportunity.id, actionId: 'a', lane: 'wedding', kind, toEmail: 'x@venue.com', mode, gmailMessageId: 'm', gmailThreadId: 't' });
  send('pitch', 'send');
  send('follow_up', 'send');
  send('pitch', 'draft');
  assert.equal(store.emailsInLast24h(), 3);
  assert.equal(store.emailsInLast24h({ kind: 'pitch' }), 2);
  send('draft_only', 'draft');
  // the newest row is a draft; the outcome must land on the last real send, not the draft
  store.markEmailOutcome(opportunity.id, { bounced: true });
  assert.deepEqual(store.laneSendStats('wedding'), { sends: 2, bounces: 1, unsubscribes: 0 });
  assert.equal(osDb.db.prepare("SELECT bounced FROM email_sends WHERE kind = 'follow_up'").get().bounced, 1);
  assert.equal(osDb.db.prepare("SELECT SUM(bounced) AS n FROM email_sends WHERE mode = 'draft'").get().n, 0);
  clock.advance(25 * 3600_000);
  assert.equal(store.emailsInLast24h(), 0);
  osDb.close();
});

test('inbound messages, portfolio sends and action lookups', () => {
  const { osDb, store } = setup();
  assert.equal(store.seenInbound('g1'), false);
  store.recordInbound({ gmailMessageId: 'g1', opportunityId: null, label: 'unrelated', confidence: null });
  assert.equal(store.seenInbound('g1'), true);
  assert.equal(store.actionByKey('pitch:x'), null);
  osDb.db.prepare(`INSERT INTO actions (id, idempotency_key, action_type, tool, payload, why, autonomy_level, status, created_at, updated_at)
    VALUES ('act1', 'pitch:x', 'email.first_contact', 'email.pitch', '{}', '{}', 'ask', 'rejected', '2026-10-14T16:00:00.000Z', '2026-10-14T16:00:00.000Z')`).run();
  assert.equal(store.actionByKey('pitch:x').status, 'rejected');
  assert.equal(store.actionsSince('email.first_contact', '2026-10-14T00:00:00.000Z'), 1);
  osDb.close();
});

test('createOpportunity works inside a caller transaction', () => {
  const { osDb, store } = setup();
  const { business } = store.upsertBusiness({ name: 'Nest', lane: 'wedding', website: 'nest.com' });
  const result = osDb.transaction(() => store.createOpportunity(business.id));
  assert.equal(result.created, true);
  assert.equal(store.stageCounts().found, 1);
  osDb.close();
});
