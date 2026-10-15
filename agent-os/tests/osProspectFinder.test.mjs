// tests/osProspectFinder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createProspectFinder, parseCandidates } from '../lib/os/gigs/prospectFinder.js';

function setup(answer, bulkReply = '[]', { searchResult = null, bulk = null, storeWrap = null } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const realStore = createGigStore(osDb);
  const store = storeWrap ? storeWrap(realStore) : realStore;
  const searches = [];
  const bulkCalls = [];
  const liveSearch = {
    async search(request) {
      searches.push(request);
      if (searchResult) return searchResult(request);
      return { answer, links: ['https://src.example/list'], costMicros: 150_000 };
    },
  };
  const router = { async run(route) { bulkCalls.push(route); if (bulk) return bulk(); return { text: bulkReply }; } };
  return { osDb, settings, store, searches, bulkCalls, finder: createProspectFinder({ liveSearch, router, store, settings }) };
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

const ONE = [{ name: 'Vine Estate', website: 'vineestate.com' }];
const names = (text) => parseCandidates(text).map((c) => c.name);

test('parseCandidates survives Grok citation markup', () => {
  const json = JSON.stringify(ONE);
  assert.deepEqual(names(`Results [[1]](https://src.com):\n${json}`), ['Vine Estate']);
  assert.deepEqual(names(`Sources [1]\n${json}`), ['Vine Estate']);
  assert.deepEqual(names('[{"name":"A","website":"a.com"} [[2]](https://x.com), {"name":"B","website":"b.com"}[3]]'), ['A', 'B']);
  assert.deepEqual(names('Notes {"x":1}\n```json\n' + json + '\n```'), ['Vine Estate']);
  assert.deepEqual(names('{"businesses":[{"name":"A","website":"a.com"}]}'), ['A']);
});

test('parseCandidates cleans website values', () => {
  const site = (website) => parseCandidates(JSON.stringify([{ name: 'A', website }]))[0].website;
  assert.equal(site('[Vine](https://vineestate.com/about)'), 'https://vineestate.com/about');
  assert.equal(site('https://vineestate.com [[1]](https://src.com)'), 'https://vineestate.com');
  assert.equal(site('vineestate.com [1]'), 'vineestate.com');
  assert.equal(site('https://vineestate.com/visit?utm_source=grok&id=7&gclid=x&fbclid=y#top'), 'https://vineestate.com/visit?id=7');
  assert.equal(site('https://vineestate.com/?utm_medium=x'), 'https://vineestate.com/');
  assert.equal(site('vineestate.com and more words'), 'vineestate.com');
});

test('unusable websites and extra portals are skipped with the right reason', async () => {
  const answer = JSON.stringify([
    { name: 'Bad', website: 'not a url at all?' },
    { name: 'Junk', website: 'localhost' },
    { name: 'Pins', website: 'https://www.pinterest.com/x' },
    { name: 'Trip', website: 'https://www.tripadvisor.fr/Hotel' },
    { name: 'Short', website: 'https://goo.gl/abc' },
    { name: 'Real', website: 'https://realwinery.com' },
  ]);
  const { osDb, finder } = setup(answer);
  const result = await finder.findForLane('winery');
  assert.deepEqual(result.created.map((c) => c.name), ['Real']);
  assert.deepEqual(result.skipped.map((s) => [s.name, s.reason]), [
    ['Bad', 'unusable website'], ['Junk', 'unusable website'], ['Pins', 'directory or social site'],
    ['Trip', 'directory or social site'], ['Short', 'directory or social site'],
  ]);
  osDb.close();
});

test('suppression of a parent domain blocks its subdomains', async () => {
  const { osDb, store, finder } = setup(JSON.stringify([{ name: 'Events', website: 'https://events.oakcellars.com' }]));
  store.suppress('oakcellars.com', 'unsubscribe');
  const result = await finder.findForLane('winery');
  assert.deepEqual(result.skipped.map((s) => s.reason), ['on the do-not-contact list']);
  osDb.close();
});

test('a search error restores the query cursor so the query is not burned', async () => {
  const { osDb, settings, finder } = setup('', '[]', { searchResult: () => ({ error: 'budget cap reached' }) });
  const result = await finder.findForLane('winery');
  assert.equal(result.skipped, 'budget cap reached');
  assert.equal(settings.get('gigs.query_cursor').winery, undefined);
  settings.set('gigs.query_cursor', { winery: 2, travel: 1 });
  await finder.findForLane('winery');
  assert.deepEqual(settings.get('gigs.query_cursor'), { winery: 2, travel: 1 });
  osDb.close();
});

test('a rejected search restores the cursor and rethrows', async () => {
  const { osDb, settings, finder } = setup('', '[]', { searchResult: () => { throw new Error('network down'); } });
  settings.set('gigs.query_cursor', { winery: 1 });
  await assert.rejects(finder.findForLane('winery'), /network down/);
  assert.deepEqual(settings.get('gigs.query_cursor'), { winery: 1 });
  osDb.close();
});

test('a garbage cursor is treated as zero', async () => {
  const { osDb, settings, searches, finder } = setup(ANSWER);
  settings.set('gigs.query_cursor', { winery: 'x' });
  await finder.findForLane('winery');
  assert.match(searches[0].query, /^Napa Valley wineries/);
  assert.equal(settings.get('gigs.query_cursor').winery, 1);
  osDb.close();
});

test('the bulk route is not called when the reply already parses', async () => {
  const { osDb, bulkCalls, finder } = setup(JSON.stringify(ONE));
  await finder.findForLane('winery');
  assert.deepEqual(bulkCalls, []);
  osDb.close();
});

test('a failing bulk conversion still reports the paid search', async () => {
  const { osDb, finder } = setup('prose only', '[]', { bulk: () => { throw new Error('model down'); } });
  const result = await finder.findForLane('winery');
  assert.deepEqual(result, {
    lane: 'winery', query: result.query, created: [], skipped: [], skippedReason: 'bulk conversion failed', costMicros: 150_000,
  });
  osDb.close();
});

test('one candidate failing to save does not stop the others', async () => {
  const answer = JSON.stringify([{ name: 'Boom', website: 'boom.com' }, { name: 'Fine', website: 'fine.com' }]);
  const { osDb, finder } = setup(answer, '[]', {
    storeWrap: (store) => ({
      ...store,
      upsertBusiness(input) {
        if (input.name === 'Boom') throw new Error('disk full');
        return store.upsertBusiness(input);
      },
    }),
  });
  const result = await finder.findForLane('winery');
  assert.deepEqual(result.created.map((c) => c.name), ['Fine']);
  assert.deepEqual(result.skipped, [{ name: 'Boom', reason: 'error: disk full' }]);
  osDb.close();
});
