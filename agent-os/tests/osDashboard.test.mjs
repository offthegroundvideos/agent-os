import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOsRuntime } from '../lib/os/runtime.js';
import { createDashboard, latestWorkerLine } from '../lib/os/dashboard.js';
import { createSettingsEditor } from '../lib/os/settingsEditor.js';
import { actorFor, errorResponse, isOwnerRequest } from '../lib/os/web.js';
import { LedgerError } from '../lib/os/ledger.js';

const NOW = new Date('2026-10-15T18:00:00Z'); // 11am Pacific

function setup() {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otg-os-dash-'));
  let tick = 0;
  // Each ledger write gets its own millisecond so "oldest first" is well defined.
  const runtime = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:' }, now: () => new Date(NOW.getTime() + (tick += 1)), log: () => {} });
  const dashboard = createDashboard({
    osDb: runtime.osDb, settings: runtime.settings, ledger: runtime.ledger, budget: runtime.budget, approvals: runtime.approvals,
    gigStore: runtime.gigStore, stages: runtime.stages, portfolio: runtime.portfolio, team: runtime.team, logDir, now: () => NOW,
  });
  return { runtime, dashboard, logDir, close: () => { runtime.close(); fs.rmSync(logDir, { recursive: true, force: true }); } };
}

function seedOpportunity(runtime, { name = 'Silver Oak', lane = 'winery', website = 'silveroak.example' } = {}) {
  const { business } = runtime.gigStore.upsertBusiness({ name, lane, website, location: 'Napa', fitReason: 'hosts weddings' });
  const contact = runtime.gigStore.addContact(business.id, { name: 'Ana', role: 'Events', email: `ana@${website}`, emailSourceUrl: `https://${website}/contact` });
  const { opportunity } = runtime.gigStore.createOpportunity(business.id);
  runtime.stages.move(opportunity.id, 'researched', {
    reason: 'site read', patch: { contact_id: contact.id, angle: 'Harvest film', evidence: ['Wedding page lists 40 events a year'] },
  });
  return opportunity.id;
}

test('latestWorkerLine reads the last line of the UTC day log, or the day before just after midnight UTC', () => {
  const { logDir, close } = setup();
  assert.equal(latestWorkerLine(logDir, NOW), null);
  fs.writeFileSync(path.join(logDir, 'otg-os-worker-2026-10-14.log'), '2026-10-14T23:00:00.000Z yesterday\n');
  assert.equal(latestWorkerLine(logDir, NOW).message, 'yesterday');
  fs.writeFileSync(path.join(logDir, 'otg-os-worker-2026-10-15.log'), '2026-10-15T07:29:17.357Z OTG-OS worker started.\r\n2026-10-15T17:59:00.000Z tick {"executed":1}\n\n');
  assert.deepEqual(latestWorkerLine(logDir, NOW), { at: '2026-10-15T17:59:00.000Z', message: 'tick {"executed":1}', file: 'otg-os-worker-2026-10-15.log' });
  close();
});

test('today() reports goal, spend, worker liveness and the day so far', async () => {
  const { runtime, dashboard, close } = setup();
  runtime.settings.set('heartbeat.last_ping_at', '2026-10-15T17:55:00.000Z');
  runtime.budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'draft', costMicros: 120_000 });
  runtime.budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'draft', costMicros: 30_000 });
  seedOpportunity(runtime);
  await runtime.registry.request({ tool: 'system.demo', payload: { draft: 'Hi' }, why: { goal: 'g', expected: 'e' }, idempotencyKey: 't1' });
  const view = dashboard.today();
  assert.equal(view.goal.target, 12);
  assert.equal(view.goal.booked, 0);
  assert.equal(view.spend.spentMicros, 150_000);
  assert.deepEqual({ ...view.spend.byModel[0] }, { provider: 'anthropic', model: 'claude-sonnet-5-5', calls: 2, micros: 150_000 });
  assert.equal(view.worker.alive, true);
  assert.equal(view.day.found, 1);
  assert.equal(view.day.researched, 1);
  assert.equal(view.waiting, 1);
  assert.equal(view.nextBundleHour, 13);
  assert.match(view.summary.join(' '), /Found 1 new prospect and researched 1\./);
  assert.match(view.summary.join(' '), /1 approval is waiting/);
  assert.equal(view.recent[0].business, 'Silver Oak');
  runtime.settings.set('heartbeat.last_ping_at', '2026-10-15T17:00:00.000Z');
  assert.equal(dashboard.today().worker.alive, false);
  close();
});

test('pendingApprovals lists proposed actions oldest first with the Telegram description', async () => {
  const { runtime, dashboard, close } = setup();
  const why = { goal: 'Book a winery shoot', expected: 'A reply', evidence: ['site'] };
  await runtime.registry.request({ tool: 'system.demo', payload: { draft: 'First' }, why, idempotencyKey: 'a1' });
  await runtime.registry.request({ tool: 'system.demo', payload: { draft: 'Second' }, why, idempotencyKey: 'a2' });
  const { items } = dashboard.pendingApprovals();
  assert.deepEqual(items.map((item) => item.draft), ['First', 'Second']);
  assert.equal(items[0].description, 'Demo action: First');
  assert.equal(items[0].why.goal, 'Book a winery shoot');
  assert.equal(items[0].inTelegram, false);
  await runtime.approvals.approve(items[0].id, { by: 'Jack (dashboard)' });
  assert.equal(dashboard.pendingApprovals().items.length, 1);
  close();
});

test('pipeline groups by lane and stage; opportunity() has history, actions and portfolio matches', async () => {
  const { runtime, dashboard, close } = setup();
  const id = seedOpportunity(runtime);
  seedOpportunity(runtime, { name: 'Bora Charters', lane: 'travel', website: 'bora.example' });
  const { item } = runtime.portfolio.store.upsert({ source: 'site', url: 'https://madebyotg.com/harvest', title: 'Harvest' });
  runtime.stages.update(id, { portfolio_ids: [item.id] });
  await runtime.registry.request({
    tool: 'system.demo', payload: { draft: 'Pitch' }, why: { goal: 'Pitch Silver Oak', expected: 'Reply', evidence: ['weddings'] },
    idempotencyKey: 'p1', opportunityId: id,
  });
  const board = dashboard.pipeline();
  assert.equal(board.counts.winery.researched, 1);
  assert.equal(board.counts.travel.researched, 1);
  assert.equal(board.opportunities.length, 2);
  assert.equal(board.opportunities.find((opp) => opp.id === id).contactEmail, 'ana@silveroak.example');
  const detail = dashboard.opportunity(id);
  assert.equal(detail.business.name, 'Silver Oak');
  assert.equal(detail.contact.email, 'ana@silveroak.example');
  assert.equal(detail.angle, 'Harvest film');
  assert.deepEqual(detail.evidence, ['Wedding page lists 40 events a year']);
  assert.deepEqual(detail.events.map((event) => event.to), ['researched', 'found']);
  assert.equal(detail.actions[0].why.goal, 'Pitch Silver Oak');
  assert.equal(detail.portfolioMatches[0].title, 'Harvest');
  assert.equal(dashboard.opportunity('opp_missing'), null);
  close();
});

test('tagPortfolio saves confirmed tags and refuses bad ones like /tag', () => {
  const { runtime, dashboard, close } = setup();
  const { item } = runtime.portfolio.store.upsert({ source: 'site', url: 'https://madebyotg.com/a', title: 'A' });
  assert.match(dashboard.tagPortfolio(item.id, { lane: 'boats' }).error, /lane must be one of/);
  assert.match(dashboard.tagPortfolio(item.id, {}).error, /at least one/);
  assert.match(dashboard.tagPortfolio(999, { lane: 'travel' }).error, /No portfolio item 999/);
  const saved = dashboard.tagPortfolio(item.id, { lane: 'real_estate', style: 'aerial', location: 'Ross' }).item;
  assert.equal(saved.lane, 'real_estate');
  assert.equal(saved.tagsConfirmed, true);
  assert.equal(dashboard.portfolioLibrary().items[0].location, 'Ross');
  assert.ok(dashboard.portfolioLibrary().options.lane.includes('other'));
  close();
});

test('settingsView shows editable values, lanes and read-only budget caps', () => {
  const { runtime, dashboard, close } = setup();
  const view = dashboard.settingsView(createSettingsEditor({ settings: runtime.settings }));
  assert.equal(view.values['outreach.mode'], 'draft');
  assert.deepEqual(view.laneOrder, ['travel', 'winery', 'wedding', 'real_estate']);
  assert.equal(view.budget.monthlyCapCents, 15000);
  close();
});

test('owner check: loopback host or the API secret; actor names follow it', () => {
  const req = (headers) => ({ headers: new Headers(headers) });
  const env = { AGENT_OS_API_SECRET: 's3cret', TELEGRAM_OWNER_NAME: 'Jack' };
  assert.equal(isOwnerRequest(req({ host: 'localhost:4000' }), env), true);
  assert.equal(isOwnerRequest(req({ host: '127.0.0.1:4000' }), env), true);
  assert.equal(isOwnerRequest(req({ host: '[::1]:4000' }), env), true);
  assert.equal(isOwnerRequest(req({ host: '100.101.1.2:4000' }), env), false);
  assert.equal(isOwnerRequest(req({ host: '100.101.1.2:4000', 'x-agent-os-secret': 's3cret' }), env), true);
  assert.equal(isOwnerRequest(req({ host: 'pc.tail.ts.net', authorization: 'Bearer s3cret' }), env), true);
  assert.equal(isOwnerRequest(req({ host: 'pc.tail.ts.net', 'x-agent-os-secret': 'wrong' }), env), false);
  assert.equal(isOwnerRequest(req({ host: 'pc.tail.ts.net' }), {}), false);
  assert.equal(actorFor(req({ host: 'localhost' }), env), 'Jack (dashboard)');
  assert.equal(actorFor(req({ host: '100.101.1.2' }), env), 'Dashboard');
});

test('errorResponse maps already-handled actions to 409 and known errors to 400', () => {
  assert.equal(errorResponse(new LedgerError('Action x is approved; expected proposed.')).status, 409);
  assert.equal(errorResponse(new LedgerError('bad')).status, 400);
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(errorResponse(new Error('boom')).status, 500);
  } finally {
    console.error = original;
  }
});
