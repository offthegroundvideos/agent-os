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
