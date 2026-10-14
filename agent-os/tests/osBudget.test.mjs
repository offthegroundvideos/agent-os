import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createBudget, formatDollars } from '../lib/os/budget.js';

function setup(startIso = '2026-10-14T16:00:00Z') {
  let t = Date.parse(startIso);
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  return { osDb, clock, settings, budget: createBudget(osDb, settings, { now: clock.now }) };
}

const spend = (budget, costMicros, extra = {}) => budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'chat', costMicros, ...extra });

test('cost uses per-model prices in micro-dollars', () => {
  const { osDb, budget } = setup();
  assert.equal(budget.costMicros('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 500 }), 7000);
  assert.equal(budget.costMicros('claude-sonnet-5-5', { inputTokens: 1000, cacheReadTokens: 1000 }), 2200);
  assert.equal(budget.costMicros('claude-haiku-5-5', { inputTokens: 10000, outputTokens: 1000 }), 1500);
  osDb.close();
});

test('unknown models are priced at the most expensive tier', () => {
  const { osDb, budget } = setup();
  assert.equal(budget.costMicros('mystery-model', { inputTokens: 1000 }), 10000);
  osDb.close();
});

test('month-to-date spend moves through ok, warning and capped', () => {
  const { osDb, budget } = setup();
  spend(budget, 99_000_000);
  assert.equal(budget.status().state, 'ok');
  spend(budget, 1_000_000);
  assert.equal(budget.status().state, 'warning');
  assert.equal(budget.canUsePaid(), true);
  spend(budget, 50_000_000);
  assert.equal(budget.status().state, 'capped');
  assert.equal(budget.canUsePaid(), false);
  osDb.close();
});

test('last month spend does not count toward this month', () => {
  const { osDb, budget, clock } = setup('2026-09-30T23:00:00Z');
  spend(budget, 200_000_000);
  clock.set('2026-10-01T01:00:00Z');
  assert.equal(budget.monthToDateMicros(), 0);
  assert.equal(budget.canUsePaid(), true);
  osDb.close();
});

test('daily tool caps reset each UTC day', () => {
  const { osDb, budget, clock } = setup();
  budget.record({ provider: 'scrapecreators', modelOrTool: 'scrapecreators', taskType: 'research', units: 20 });
  assert.equal(budget.toolUnitsToday('scrapecreators'), 20);
  assert.equal(budget.canUseTool('scrapecreators'), false);
  assert.equal(budget.canUseTool('uncapped-tool'), true);
  clock.set('2026-10-15T00:30:00Z');
  assert.equal(budget.canUseTool('scrapecreators'), true);
  osDb.close();
});

test('formatDollars rounds micro-dollars to cents', () => {
  assert.equal(formatDollars(1_234_567), '$1.23');
  assert.equal(formatDollars(0), '$0.00');
});
