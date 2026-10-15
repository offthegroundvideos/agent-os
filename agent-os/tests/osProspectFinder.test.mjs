// tests/osProspectFinder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createProspectFinder, parseCandidates } from '../lib/os/gigs/prospectFinder.js';

function setup(answer, bulkReply = '[]') {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createGigStore(osDb);
  const searches = [];
  const liveSearch = { async search(request) { searches.push(request); return { answer, links: ['https://src.example/list'], costMicros: 150_000 }; } };
  const router = { async run() { return { text: bulkReply }; } };
  return { osDb, settings, store, searches, finder: createProspectFinder({ liveSearch, router, store, settings }) };
}

const ANSWER = JSON.stringify([
  { name: 'Vine Estate', website: 'https://www.vineestate.com', location: 'Napa, CA', fit_reason: 'Hosts weddings' },
  { name: 'Listing Portal', website: 'https://www.theknot.com/vine', location: '', fit_reason: '' },
  { name: 'No Site', location: 'Napa' },
  { name: 'Oak Cellars', website: 'oakcellars.com', location: 'Sonoma, CA', fit_reason: 'Release events' },
]);

test('parseCandidates keeps named entries with websites', () => {
  assert.deepEqual(parseCandidates(ANSWER).map((c) => c.name), ['Vine Estate', 'Listing Portal', 'Oak Cellars']);
  assert.deepEqual(parseCandidates('no json'), []);
  assert.deepEqual(parseCandidates('{"businesses":[{"name":"A","website":"a.com"}]}').map((c) => c.name), ['A']);
});

test('a lane search creates found opportunities and skips portals, duplicates and blocked domains', async () => {
  const { osDb, store, searches, finder } = setup(ANSWER);
  store.suppress('oakcellars.com', 'unsubscribe');
  const result = await finder.findForLane('winery');
  assert.equal(searches[0].sources, 'web');
  assert.match(searches[0].query, /^Napa Valley wineries that host weddings or private events\. Find up to 8/);
  assert.deepEqual(result.created.map((c) => c.name), ['Vine Estate']);
  assert.deepEqual(result.skipped.map((s) => s.reason), ['directory or social site', 'on the do-not-contact list']);
  const [opp] = store.listOpportunities({ stage: 'found' });
  assert.equal(opp.business.timezone, 'America/Los_Angeles');
  assert.equal(opp.business.sourceUrl, 'https://src.example/list');
  const again = await finder.findForLane('winery');
  assert.match(searches[1].query, /^Sonoma County wineries/);
  assert.deepEqual(again.skipped.map((s) => s.reason), ['already known', 'directory or social site', 'on the do-not-contact list']);
  osDb.close();
});

test('falls back to the bulk route when Grok replies in prose', async () => {
  const { osDb, finder } = setup('Here are some: Vine Estate (vineestate.com)...', '[{"name":"Vine Estate","website":"vineestate.com"}]');
  assert.deepEqual((await finder.findForLane('travel')).created.map((c) => c.name), ['Vine Estate']);
  osDb.close();
});

test('inactive lanes and search errors are skipped', async () => {
  const { osDb, settings, finder } = setup(ANSWER);
  settings.set('gigs.lanes', { ...settings.get('gigs.lanes'), wedding: { ...settings.get('gigs.lanes').wedding, active: false } });
  assert.equal((await finder.findForLane('wedding')).skipped, 'lane inactive');
  osDb.close();
});
