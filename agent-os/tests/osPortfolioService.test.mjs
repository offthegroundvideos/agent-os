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

function setup(replies) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createPortfolioStore(osDb);
  const calls = [];
  const router = { async run(task, request) { calls.push({ task, request }); return { text: replies.shift() }; } };
  const pages = { 'https://madebyotg.com/work/': INDEX, 'https://madebyotg.com/work/sail/': PAGE };
  const fetchImpl = async (url) => ({ ok: Boolean(pages[url]), status: pages[url] ? 200 : 404, text: async () => pages[url] ?? '' });
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
