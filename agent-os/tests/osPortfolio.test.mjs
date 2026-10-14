// tests/osPortfolio.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createPortfolioStore } from '../lib/os/portfolio/store.js';
import { matchPortfolio } from '../lib/os/portfolio/matcher.js';

const NOW = Date.parse('2026-10-14T00:00:00Z');

test('upsert keeps one row per url and never overwrites confirmed tags', () => {
  const osDb = openOsDb(':memory:');
  const store = createPortfolioStore(osDb);
  const first = store.upsert({ source: 'site', url: 'https://madebyotg.com/work/a/', title: 'A', description: 'd', thumbnailUrl: 't', publishedAt: '2026-01-01', deliverableType: 'film' });
  assert.equal(first.created, true);
  assert.equal(store.upsert({ source: 'site', url: 'https://madebyotg.com/work/a/', title: 'A2' }).created, false);
  assert.equal(store.get(first.item.id).title, 'A2');
  assert.deepEqual(store.untagged().map((i) => i.id), [first.item.id]);
  store.setTags(first.item.id, { lane: 'winery', style: 'cinematic', location: 'Napa' }, { confirmed: true });
  store.setTags(first.item.id, { lane: 'other', style: 'energetic' });
  const item = store.get(first.item.id);
  assert.equal(item.lane, 'winery');
  assert.equal(item.tagsConfirmed, true);
  assert.deepEqual(store.untagged(), []);
  store.setActive(first.item.id, false);
  assert.deepEqual(store.list(), []);
  osDb.close();
});

const piece = (id, lane, style, location, publishedAt, extra = {}) => ({ id, lane, style, location, publishedAt, active: true, tagsConfirmed: false, title: `p${id}`, ...extra });

test('matcher ranks lane, then style, then place, then recency', () => {
  const items = [
    piece(1, 'other', 'energetic', 'Lake Tahoe', '2026-09-01'),
    piece(2, 'winery', 'documentary', 'Sonoma', '2024-01-01'),
    piece(3, 'winery', 'cinematic', 'Napa Valley', '2025-06-01'),
    piece(4, 'travel', 'cinematic', 'Bora Bora', '2026-01-01'),
    piece(5, 'winery', 'cinematic', 'Napa', '2026-01-01', { active: false }),
  ];
  const result = matchPortfolio(items, { lane: 'winery', style: 'cinematic', location: 'Napa, CA' }, { now: NOW });
  assert.deepEqual(result.map((r) => r.item.id), [3, 2, 4]);
  assert.deepEqual(result[0].reasons, ['same lane', 'cinematic style', 'same area']);
  assert.deepEqual(matchPortfolio([], { lane: 'winery' }, { now: NOW }), []);
});

test('re-upsert keeps good text, tags and active state', () => {
  const osDb = openOsDb(':memory:');
  const store = createPortfolioStore(osDb);
  const { item } = store.upsert({ source: 'site', url: 'https://madebyotg.com/work/b/', title: 'B', description: 'good text', thumbnailUrl: 't', publishedAt: '2026-02-02', deliverableType: 'film' });
  store.setTags(item.id, { lane: 'winery', style: 'cinematic' }, { confirmed: true });
  store.setActive(item.id, false);
  store.upsert({ source: 'site', url: 'https://madebyotg.com/work/b/', title: '', description: '', thumbnailUrl: '', publishedAt: '', deliverableType: '' });
  const after = store.get(item.id);
  assert.equal(after.description, 'good text');
  assert.equal(after.title, 'B');
  assert.equal(after.thumbnailUrl, 't');
  assert.equal(after.publishedAt, '2026-02-02');
  assert.equal(after.deliverableType, 'film');
  assert.equal(after.lane, 'winery');
  assert.equal(after.style, 'cinematic');
  assert.equal(after.tagsConfirmed, true);
  assert.equal(after.active, false);
  store.upsert({ source: 'site', url: 'https://madebyotg.com/work/b/', deliverableType: 'reel' });
  assert.equal(store.get(item.id).deliverableType, 'reel');
  osDb.close();
});

test('unconfirmed tags are suggestions that blanks never erase; confirmed may blank', () => {
  const osDb = openOsDb(':memory:');
  const store = createPortfolioStore(osDb);
  const { item } = store.upsert({ source: 'manual', url: 'https://example.com/x', title: 'X' });
  const suggested = store.setTags(item.id, { lane: '  Winery ', style: 'Cinematic' });
  assert.equal(suggested.lane, 'winery');
  assert.equal(suggested.style, 'cinematic');
  assert.equal(suggested.tagsConfirmed, false);
  assert.equal(store.setTags(item.id, { lane: '' }).lane, 'winery');
  const blanked = store.setTags(item.id, { location: 'Napa' , lane: '' }, { confirmed: true });
  assert.equal(blanked.lane, '');
  assert.equal(blanked.location, 'Napa');
  osDb.close();
});

test('store rejects bad input', () => {
  const osDb = openOsDb(':memory:');
  const store = createPortfolioStore(osDb);
  assert.throws(() => store.setActive(999, true), /No portfolio item 999\./);
  assert.throws(() => store.upsert({ source: 'site', title: 'no url' }), /Portfolio items need a url and a source\./);
  assert.throws(() => store.upsert({ url: ' https://example.com/y ', title: 'no source' }), /Portfolio items need a url and a source\./);
  assert.throws(() => store.upsert({ source: 'site', url: '   ' }), /Portfolio items need a url and a source\./);
  osDb.close();
});

test('matcher ignores generic place words', () => {
  const area = (have, want) => matchPortfolio([piece(1, 'x', 'y', have, '2026-01-01')], { location: want }, { now: NOW })[0].reasons.includes('same area');
  assert.equal(area('San Diego', 'San Francisco'), false);
  assert.equal(area('Clear Lake', 'Lake Tahoe'), false);
  assert.equal(area('Napa Valley', 'Napa, CA'), true);
});
