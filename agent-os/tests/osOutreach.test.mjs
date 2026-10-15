// tests/osOutreach.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createOutreach, pitchKey, replySubject } from '../lib/os/gigs/outreach.js';

function setup(replies) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createGigStore(osDb);
  const stages = createStages(osDb);
  const { business } = store.upsertBusiness({ name: 'Vine Estate', lane: 'winery', website: 'vineestate.com', location: 'Napa, CA' });
  const { opportunity } = store.createOpportunity(business.id);
  const contact = store.addContact(business.id, { name: 'Kim', role: 'Events', email: 'events@vineestate.com', emailSourceUrl: 'https://vineestate.com/contact' });
  stages.move(opportunity.id, 'researched', { patch: { contact_id: contact.id, angle: 'Barrel-room weddings', evidence: ['Hosts 120'], portfolio_ids: [3] } });
  const prompts = [];
  const router = { async run(task, request) { prompts.push({ task, request }); return { text: replies.shift(), needsReview: false }; } };
  const requests = [];
  const registry = { async request(request) { requests.push(request); return { id: `act_${requests.length}` }; } };
  const piece = { id: 3, title: 'Cypress Garden', url: 'https://madebyotg.com/work/cypress-garden-editorial/', description: 'Editorial portraits' };
  const portfolio = { store: { get: (id) => (id === 3 ? piece : null) }, match: () => [{ item: piece }] };
  const outreach = createOutreach({ router, store, portfolio, registry, settings });
  return { osDb, store, stages, outreach, prompts, requests, id: opportunity.id };
}

test('replySubject adds Re: once', () => {
  assert.equal(replySubject('Barrel room films'), 'Re: Barrel room films');
  assert.equal(replySubject('RE: Barrel room films'), 'RE: Barrel room films');
});

test('a researched opportunity gets a drafted pitch filed for approval with its why', async () => {
  const { osDb, store, outreach, prompts, requests, id } = setup(['{"subject":"Barrel room films","body":"Hi Kim, ..."}']);
  assert.deepEqual(await outreach.draftPitch(id), { actionId: 'act_1' });
  assert.equal(prompts[0].task, 'draft');
  assert.match(prompts[0].request.messages[0].content, /Angle: Barrel-room weddings[\s\S]*- Cypress Garden — https:\/\/madebyotg.com\/work\/cypress-garden-editorial\//);
  const [request] = requests;
  assert.equal(request.tool, 'email.pitch');
  assert.equal(request.idempotencyKey, pitchKey(store.getOpportunity(id)));
  assert.deepEqual(request.payload, {
    opportunityId: id, business: 'Vine Estate', to: 'events@vineestate.com', subject: 'Barrel room films',
    draft: 'Hi Kim, ...', portfolioIds: [3], needsReview: false,
  });
  assert.equal(request.why.goal, 'Book paid winery shoots');
  assert.deepEqual(request.why.evidence, ['Barrel-room weddings', 'Hosts 120', 'Email published at https://vineestate.com/contact']);
  assert.deepEqual(await outreach.draftPitch('opp_missing'), { skipped: 'not ready to pitch' });
  osDb.close();
});

test('a pitch subject with line breaks is collapsed to one line', async () => {
  const { osDb, outreach, requests, id } = setup(['{"subject":"Barrel room\\n  films\\tfor Vine","body":"Hi Kim"}']);
  await outreach.draftPitch(id);
  assert.equal(requests[0].payload.subject, 'Barrel room films for Vine');
  osDb.close();
});

test('follow-ups and portfolio replies are filed in the same thread', async () => {
  const { osDb, stages, outreach, requests, id } = setup(['{"body":"Quick idea"}', '{"body":"Here are three"}']);
  stages.move(id, 'pitched', { patch: { gmail_thread_id: 'th1', subject: 'Barrel room films', last_message_id_header: '<p@x>', pitched_at: '2026-10-14T17:00:00.000Z' } });
  await outreach.draftFollowUp(id, { inReplyTo: '<sent@x>' });
  assert.deepEqual(
    [requests[0].tool, requests[0].idempotencyKey, requests[0].payload.subject, requests[0].payload.threadId, requests[0].payload.inReplyTo],
    ['email.follow_up', `followup:${id}:1`, 'Re: Barrel room films', 'th1', '<sent@x>'],
  );
  stages.move(id, 'replied');
  await outreach.draftPortfolioReply(id, { style: 'cinematic', request: 'Do you have wedding films?', inReplyTo: '<kim@vine>' });
  assert.deepEqual(
    [requests[1].tool, requests[1].urgent, requests[1].payload.inReplyTo, requests[1].payload.portfolioIds],
    ['email.portfolio', true, '<kim@vine>', [3]],
  );
  assert.deepEqual(await outreach.draftFollowUp(id), { skipped: 'not waiting on a reply' });
  osDb.close();
});

test('a draft without a subject is refused', async () => {
  const { osDb, outreach, id } = setup(['{"body":"no subject"}']);
  await assert.rejects(outreach.draftPitch(id), /without a subject or body/);
  osDb.close();
});

test('a follow-up with an empty body is refused before anything is filed', async () => {
  const { osDb, stages, outreach, requests, id } = setup(['{"body":"   "}']);
  stages.move(id, 'pitched', { patch: { gmail_thread_id: 'th1', subject: 'Barrel room films', pitched_at: '2026-10-14T17:00:00.000Z' } });
  await assert.rejects(outreach.draftFollowUp(id), /The follow-up draft came back empty\./);
  assert.equal(requests.length, 0);
  osDb.close();
});

test('a portfolio reply with an empty body is refused before anything is filed', async () => {
  const { osDb, stages, outreach, requests, id } = setup(['{}']);
  stages.move(id, 'pitched', { patch: { gmail_thread_id: 'th1', subject: 'Barrel room films', pitched_at: '2026-10-14T17:00:00.000Z' } });
  stages.move(id, 'replied');
  await assert.rejects(outreach.draftPortfolioReply(id, { request: 'Examples?' }), /The portfolio reply draft came back empty\./);
  assert.equal(requests.length, 0);
  osDb.close();
});
