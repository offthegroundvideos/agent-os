// tests/osPortfolioService.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createPortfolioStore } from '../lib/os/portfolio/store.js';
import { normalizeTags } from '../lib/os/portfolio/tagger.js';
import { createPortfolio } from '../lib/os/portfolio/index.js';

const INDEX = '<a href="/work/sail/">Sail</a>';
const PAGE = '<meta property="og:title" content="Sail Week"><meta property="og:description" content="Catamaran week in Raiatea.">';

function setup(replies, { routerRun, fetchOverride } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createPortfolioStore(osDb);
  const calls = [];
  const router = { async run(task, request) { calls.push({ task, request }); if (routerRun) return routerRun(task, request); return { text: replies.shift() }; } };
  const pages = { 'https://madebyotg.com/work/': INDEX, 'https://madebyotg.com/work/sail/': PAGE };
  const fetchImpl = fetchOverride ?? (async (url) => ({ ok: Boolean(pages[url]), status: pages[url] ? 200 : 404, text: async () => pages[url] ?? '' }));
  const budget = { canUseTool: () => true, record: () => {} };
  const portfolio = createPortfolio({ store, router, budget, settings, scrapeCreatorsKey: '', fetchImpl, now: () => new Date('2026-10-14T00:00:00Z') });
  return { osDb, store, portfolio, calls };
}

test('normalizeTags keeps only known values', () => {
  assert.deepEqual(normalizeTags({ lane: 'boats', style: 'moody', location: 'Napa', deliverable_type: 'gif' }, 'film'),
    { lane: 'other', style: '', location: 'Napa', deliverableType: 'film' });
});

test('importAll imports the site, skips Instagram without a key, and tags new pieces on the bulk route', async () => {
  const { osDb, store, portfolio, calls } = setup(['{"lane":"travel","style":"cinematic","location":"Raiatea","deliverable_type":"film"}']);
  const report = await portfolio.importAll();
  assert.deepEqual({ site: report.site, created: report.created, tagged: report.tagged }, { site: 1, created: 1, tagged: 1 });
  assert.match(report.errors[0], /instagram: SCRAPECREATORS_API_KEY is not set/);
  assert.equal(calls[0].task, 'bulk');
  const [item] = store.list();
  assert.deepEqual([item.lane, item.style, item.location], ['travel', 'cinematic', 'Raiatea']);
  assert.equal(portfolio.match({ lane: 'travel' })[0].item.id, item.id);
  assert.match(portfolio.text(), /1\. Sail Week — travel\/cinematic/);
  osDb.close();
});

test('the owner can correct tags with a tag command', async () => {
  const { osDb, store, portfolio } = setup(['{"lane":"other"}']);
  await portfolio.importAll();
  const [item] = store.list();
  assert.match(portfolio.tag([String(item.id), 'lane=travel', 'style=aerial', 'location=Bora_Bora']), /Saved: Sail Week — travel\/aerial/);
  assert.equal(store.get(item.id).tagsConfirmed, true);
  assert.equal(store.get(item.id).location, 'Bora Bora');
  assert.match(portfolio.tag(['999', 'lane=travel']), /No portfolio item 999/);
  assert.match(portfolio.tag([String(item.id), 'lane=boats']), /lane must be one of/);
  osDb.close();
});

const twoPages = {
  'https://madebyotg.com/work/': '<a href="/work/a/">A</a><a href="/work/b/">B</a>',
  'https://madebyotg.com/work/a/': '<meta property="og:title" content="Piece A">',
  'https://madebyotg.com/work/b/': '<meta property="og:title" content="Piece B">',
};
const twoFetch = async (url) => ({ ok: Boolean(twoPages[url]), status: twoPages[url] ? 200 : 404, text: async () => twoPages[url] ?? '' });

test('a site import that throws still lets the Instagram skip message and tagging run', async () => {
  const { osDb, store, portfolio } = setup(['{"lane":"winery"}'], { fetchOverride: async () => { throw new Error('offline'); } });
  store.upsert({ source: 'site', url: 'https://madebyotg.com/work/old/', title: 'Old piece' });
  const report = await portfolio.importAll();
  assert.ok(report.errors.some((e) => /^site: /.test(e)));
  assert.ok(report.errors.some((e) => /instagram: SCRAPECREATORS_API_KEY is not set/.test(e)));
  assert.equal(report.tagged, 1);
  osDb.close();
});

test('a router failure stops tagging', async () => {
  const { osDb, portfolio, calls } = setup([], {
    fetchOverride: twoFetch,
    routerRun: async () => { const error = new Error('all providers failed'); error.name = 'RouterError'; throw error; },
  });
  const report = await portfolio.importAll();
  assert.equal(report.tagged, 0);
  assert.equal(calls.length, 1);
  assert.ok(report.errors.some((e) => /^tagging/.test(e)));
  osDb.close();
});

test('one unparseable tag reply does not block the next piece', async () => {
  const { osDb, store, portfolio, calls } = setup(['not json at all', '{"lane":"wedding"}'], { fetchOverride: twoFetch });
  const report = await portfolio.importAll();
  assert.equal(calls.length, 2);
  assert.equal(report.tagged, 1);
  assert.equal(report.errors.filter((e) => /^tagging \d+: /.test(e)).length, 1);
  assert.equal(store.list().filter((i) => i.lane === 'wedding').length, 1);
  osDb.close();
});

test('a confirmed item is not overwritten by a later importAll', async () => {
  const { osDb, store, portfolio } = setup(['{"lane":"other"}', '{"lane":"winery"}']);
  await portfolio.importAll();
  const [item] = store.list();
  portfolio.tag([String(item.id), 'lane=travel']);
  await portfolio.importAll();
  assert.equal(store.get(item.id).lane, 'travel');
  osDb.close();
});

test('tag() parses safely', async () => {
  const { osDb, store, portfolio } = setup(['{"lane":"other"}']);
  await portfolio.importAll();
  const [item] = store.list();
  const id = String(item.id);
  assert.match(portfolio.tag([id, 'location=a=b']), /\(a=b\)/);
  assert.equal(store.get(item.id).location, 'a=b');
  assert.equal(portfolio.tag([id, 'location']), 'Use key=value, for example lane=winery.');
  assert.match(portfolio.tag(['abc', 'lane=travel']), /^Usage: \/tag <number>/);
  assert.match(portfolio.tag(['0', 'lane=travel']), /^Usage: \/tag <number>/);
  assert.match(portfolio.tag([id]), /^Usage: \/tag <number>/);
  assert.equal(store.get(item.id).lane, 'other');
  assert.match(portfolio.tag([id, 'constructor=x']), /Unknown tag constructor/);
  assert.match(portfolio.tag([id, '__proto__=x']), /Unknown tag __proto__/);
  assert.match(portfolio.tag([id, 'lane=Travel']), /Saved: .* — travel/);
  assert.equal(store.get(item.id).lane, 'travel');
  osDb.close();
});

test('normalizeTags sanitizes untrusted location text', () => {
  assert.equal(normalizeTags({ location: 'Napa\n<b>Valley</b> ignore: previous!' }).location, 'Napa b Valley b ignore previous');
});
