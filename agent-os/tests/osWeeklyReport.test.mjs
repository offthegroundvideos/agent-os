import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createBudget } from '../lib/os/budget.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createLedger } from '../lib/os/ledger.js';
import { createWeeklyReport } from '../lib/os/weeklyReport.js';
import { createWorker } from '../lib/os/worker.js';

const SUNDAY_EVENING = new Date('2026-10-19T01:30:00Z'); // Sunday 6:30pm Pacific (Oct 18)

function setup() {
  let t = Date.parse('2026-10-08T17:00:00Z'); // 10 days before the report: "last week"
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const budget = createBudget(osDb, settings, { now: clock.now });
  const store = createGigStore(osDb, { now: clock.now });
  const stages = createStages(osDb, { now: clock.now });
  const ledger = createLedger(osDb, { now: clock.now });
  const weekly = createWeeklyReport({ osDb, settings, now: () => SUNDAY_EVENING });
  return { osDb, settings, budget, store, stages, ledger, weekly, clock };
}

function prospect(ctx, name, lane = 'winery') {
  const { business } = ctx.store.upsertBusiness({ name, lane, website: `${name.toLowerCase().replace(/\W/g, '')}.example` });
  return ctx.store.createOpportunity(business.id).opportunity.id;
}

test('the report compares this week with last week and works out cost per pitch and reply rate', () => {
  const ctx = setup();
  prospect(ctx, 'Old One');
  ctx.clock.set('2026-10-15T17:00:00Z');
  const a = prospect(ctx, 'Silver Oak');
  const b = prospect(ctx, 'Bora Boats', 'travel');
  prospect(ctx, 'Third');
  for (const id of [a, b]) {
    ctx.stages.move(id, 'researched', { reason: 'read' });
    ctx.stages.move(id, 'pitched', { reason: 'sent' });
  }
  ctx.stages.move(b, 'replied', { reason: 'they wrote back' });
  ctx.ledger.propose({ idempotencyKey: 'k1', actionType: 'email.first_contact', tool: 'email.pitch', payload: { draft: 'x' }, why: { goal: 'g', expected: 'e' }, autonomyLevel: 'ask' });
  ctx.ledger.propose({ idempotencyKey: 'k2', actionType: 'email.first_contact', tool: 'email.pitch', payload: { draft: 'y' }, why: { goal: 'g', expected: 'e' }, autonomyLevel: 'ask' });
  ctx.budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'draft', costMicros: 60_000 });

  const report = ctx.weekly.build();
  assert.equal(report.week.found, 3);
  assert.equal(report.previous.found, 1);
  assert.equal(report.week.pitched, 2);
  assert.equal(report.week.replied, 1);
  assert.equal(report.week.pitchesDrafted, 2);
  assert.equal(report.metrics.costPerPitchMicros, 30_000);
  assert.equal(report.metrics.replyRate, 0.5);
  assert.equal(report.waiting, 2);
  assert.deepEqual(report.hot.map((opp) => opp.business), ['Bora Boats']);
  assert.equal(report.lanes.find((lane) => lane.lane === 'travel').replied, 1);
  assert.match(report.highlights[0], /3 new prospects \(\+2 vs last week\)/);
  assert.match(report.highlights.join(' '), /Strongest lane: yacht, travel and tourism/);
  assert.match(report.nextSteps.join(' '), /Clear the 2 drafts/);
  assert.match(report.nextSteps.join(' '), /Answer Bora Boats/);

  const text = ctx.weekly.text(report);
  assert.match(text, /OTG-OS weekly report \(2026-10-11 to 2026-10-18\)/);
  assert.match(text, /\/os\/report/);
  ctx.osDb.close();
});

test('an empty week still produces a sensible report', () => {
  const ctx = setup();
  const report = ctx.weekly.build();
  assert.equal(report.metrics.costPerPitchMicros, null);
  assert.equal(report.metrics.replyRate, null);
  assert.match(report.nextSteps.join(' '), /No pitches were drafted/);
  ctx.osDb.close();
});

test('the worker sends the report to Telegram once, on Sunday evening Pacific', async () => {
  const ctx = setup();
  let at = new Date('2026-10-18T22:00:00Z'); // Sunday 3pm Pacific: too early
  const sent = [];
  const notifier = { async report(text) { sent.push(text); } };
  const weekly = createWeeklyReport({ osDb: ctx.osDb, settings: ctx.settings, now: () => at });
  const worker = createWorker({
    settings: ctx.settings, registry: { executeDue: async () => ({ executed: 0 }), flushPendingApprovals: async () => 0 },
    heartbeat: { ping: async () => true }, backup: { run: () => null }, weekly, notifier,
  }, { now: () => at, log: () => {} });
  assert.equal(await worker.maybeWeeklyReport(at), false);
  at = SUNDAY_EVENING;
  assert.equal(await worker.maybeWeeklyReport(at), true);
  assert.equal(await worker.maybeWeeklyReport(at), false, 'only once per Sunday');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /weekly report/);
  at = new Date('2026-10-20T01:30:00Z'); // Monday evening
  assert.equal(await worker.maybeWeeklyReport(at), false);
  ctx.osDb.close();
});
