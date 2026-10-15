// tests/osProspectResearch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createProspectResearch } from '../lib/os/gigs/prospectResearch.js';

function setup({ site, verdict, matches = [] }) {
  const osDb = openOsDb(':memory:');
  const store = createGigStore(osDb);
  const stages = createStages(osDb);
  const { business } = store.upsertBusiness({ name: 'Vine Estate', lane: 'winery', website: 'vineestate.com', location: 'Napa, CA' });
  const { opportunity } = store.createOpportunity(business.id);
  const calls = [];
  const siteFetch = { async fetchSite(url) { calls.push(url); if (site instanceof Error) throw site; return site; } };
  const router = { async run(task, request) { calls.push(task); calls.push(request.messages[0].content); return { text: JSON.stringify(verdict) }; } };
  const portfolio = { match: (want) => { calls.push(want); return matches; } };
  const research = createProspectResearch({ siteFetch, router, store, stages, portfolio });
  return { osDb, store, stages, research, id: opportunity.id, calls };
}

const SITE = {
  blocked: false,
  pages: [{ url: 'https://vineestate.com/', text: 'Weddings in the barrel room. Contact events@vineestate.com' }],
  emails: [{ email: 'events@vineestate.com', sourceUrl: 'https://vineestate.com/contact' }, { email: 'info@vineestate.com', sourceUrl: 'https://vineestate.com/' }],
};

test('a fitting prospect is researched with a verified contact and matched portfolio', async () => {
  const verdict = { fit: true, reason: 'Hosts weddings', angle: 'Barrel-room weddings', evidence: ['Barrel room hosts 120'], style: 'cinematic', location: 'Napa, CA', contact_name: 'Kim', contact_role: 'Events', best_email: 'EVENTS@vineestate.com' };
  const matches = [{ item: { id: 7, lane: 'travel' } }];
  const { osDb, store, research, id, calls } = setup({ site: SITE, verdict, matches });
  assert.deepEqual(await research.research(id), { researched: true, email: 'events@vineestate.com', portfolio: 1 });
  assert.equal(calls[1], 'classify');
  assert.match(calls[2], /Emails found on the site: events@vineestate.com, info@vineestate.com/);
  assert.deepEqual(calls[3], { lane: 'winery', style: 'cinematic', location: 'Napa, CA' });
  const opp = store.getOpportunity(id);
  assert.equal(opp.stage, 'researched');
  assert.equal(opp.contact.email, 'events@vineestate.com');
  assert.equal(opp.contact.name, 'Kim');
  assert.equal(opp.angle, 'Barrel-room weddings');
  assert.deepEqual(opp.evidence, ['Barrel room hosts 120', 'Portfolio gap: no winery piece yet']);
  assert.deepEqual(opp.portfolioIds, [7]);
  osDb.close();
});

test('an invented email is replaced by one actually found on the site', async () => {
  const verdict = { fit: true, reason: 'ok', angle: 'a', evidence: [], style: 'none', best_email: 'ceo@madeup.com' };
  const { osDb, store, research, id } = setup({ site: SITE, verdict });
  await research.research(id);
  assert.equal(store.getOpportunity(id).contact.email, 'events@vineestate.com');
  assert.equal(store.getOpportunity(id).style, '');
  osDb.close();
});

test('no public email, blocked sites, unreachable sites and poor fits are closed with a reason', async () => {
  const cases = [
    [{ ...SITE, emails: [] }, { fit: true }, 'no_public_contact'],
    [{ ...SITE, blocked: true, pages: [], emails: [] }, { fit: true }, 'site_blocked'],
    [{ pages: [], emails: [], blocked: false, offSite: 'https://parked.example/' }, { fit: true }, 'website_redirects_elsewhere'],
    [new Error('timeout'), { fit: true }, 'website_unreachable'],
    [SITE, { fit: false, reason: 'Sells wine online only' }, 'not_a_fit'],
  ];
  for (const [site, verdict, reason] of cases) {
    const { osDb, store, research, id } = setup({ site, verdict });
    assert.deepEqual(await research.research(id), { closed: reason });
    assert.equal(store.getOpportunity(id).stage, 'closed_lost');
    assert.equal(store.getOpportunity(id).closeReason, reason);
    osDb.close();
  }
});

test('suppressed addresses are never chosen', async () => {
  const verdict = { fit: true, reason: 'ok', angle: 'a', evidence: [], best_email: 'events@vineestate.com' };
  const { osDb, store, research, id } = setup({ site: SITE, verdict });
  store.suppress('events@vineestate.com', 'unsubscribe');
  await research.research(id);
  assert.equal(store.getOpportunity(id).contact.email, 'info@vineestate.com');
  osDb.close();
});
