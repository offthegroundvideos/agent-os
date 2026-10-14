import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createRegistry } from '../lib/os/registry.js';
import { demoTool } from '../lib/os/tools/demo.js';

const why = { goal: 'Verify the loop', expected: 'It runs' };

function fakeNotifier() {
  const calls = { approvals: [], tells: [], alerts: [], offers: [] };
  let nextId = 1;
  return {
    calls,
    async requestApproval(action, description) { calls.approvals.push({ id: action.id, description }); return nextId++; },
    async tell(action, description) { calls.tells.push({ id: action.id, description }); },
    async alert(text) { calls.alerts.push(text); },
    async offerPromotion(offer) { calls.offers.push(offer); },
  };
}

function setup() {
  let t = Date.parse('2026-10-14T16:00:00Z');
  const clock = { now: () => new Date(t), advance: (ms) => { t += ms; } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb, { now: clock.now });
  const gate = createApprovalGate(osDb, { now: clock.now });
  const notifier = fakeNotifier();
  const registry = createRegistry({ ledger, gate, settings, notifier, now: clock.now });
  const executed = [];
  registry.register(demoTool);
  registry.register({ name: 'research.note', actionType: 'research.note', describe: (p) => `note ${p.text}`, execute: async (p) => { executed.push(p.text); return { ok: true }; } });
  registry.register({ name: 'calendar.hold', actionType: 'calendar.hold', describe: (p) => `hold ${p.date}`, execute: async (p) => { executed.push(p.date); return { eventId: 'evt_1' }; } });
  registry.register({ name: 'email.follow_up', actionType: 'email.follow_up', describe: (p) => p.draft, execute: async () => ({ sent: true }) });
  registry.register({ name: 'research.flaky', actionType: 'research.flaky', describe: () => 'flaky', execute: async () => { throw new Error('upstream down'); } });
  return { osDb, clock, settings, ledger, gate, notifier, registry, executed };
}

test('ask actions wait for approval and urgent ones are sent at once', async () => {
  const { osDb, registry, notifier, ledger } = setup();
  const action = await registry.request({ tool: 'system.demo', payload: { draft: 'Hello' }, why, idempotencyKey: 'k1', urgent: true });
  assert.equal(action.status, 'proposed');
  assert.equal(notifier.calls.approvals.length, 1);
  assert.equal(notifier.calls.approvals[0].description, 'Demo action: Hello');
  assert.equal(ledger.get(action.id).telegramMessageId, 1);
  assert.equal((await registry.executeDue()).executed, 0);
  osDb.close();
});

test('non-urgent approvals wait for the next bundle', async () => {
  const { osDb, registry, notifier } = setup();
  await registry.request({ tool: 'system.demo', payload: { draft: 'Hello' }, why, idempotencyKey: 'k1' });
  assert.equal(notifier.calls.approvals.length, 0);
  assert.equal(await registry.flushPendingApprovals(), 1);
  assert.equal(notifier.calls.approvals.length, 1);
  assert.equal(await registry.flushPendingApprovals(), 0);
  osDb.close();
});

test('an approved action runs on the next execution and stores its result', async () => {
  const { osDb, registry, ledger } = setup();
  const action = await registry.request({ tool: 'system.demo', payload: { draft: 'Hello' }, why, idempotencyKey: 'k1' });
  await registry.approve(action.id);
  assert.equal((await registry.executeDue()).executed, 1);
  const done = ledger.get(action.id);
  assert.equal(done.status, 'done');
  assert.equal(done.result.echoed, 'Hello');
  osDb.close();
});

test('tell actions run and notify; silent actions run quietly', async () => {
  const { osDb, registry, notifier, executed } = setup();
  const hold = await registry.request({ tool: 'calendar.hold', payload: { date: '2026-10-24' }, why, idempotencyKey: 'h1' });
  assert.equal(hold.status, 'approved');
  await registry.request({ tool: 'research.note', payload: { text: 'winery list' }, why, idempotencyKey: 'n1' });
  await registry.executeDue();
  assert.deepEqual([...executed].sort(), ['2026-10-24', 'winery list']);
  assert.equal(notifier.calls.tells.length, 1);
  assert.equal(notifier.calls.tells[0].description, 'hold 2026-10-24');
  osDb.close();
});

test('edits are measured against the original draft and heavy edits demote', async () => {
  const { osDb, registry, ledger, gate, notifier } = setup();
  const action = await registry.request({ tool: 'system.demo', payload: { draft: 'Please confirm the Saturday shoot.' }, why, idempotencyKey: 'k1' });
  await registry.revise(action.id, 'Completely rewritten message about something else entirely.');
  assert.equal(notifier.calls.approvals.length, 1);
  const approved = await registry.approve(action.id);
  assert.ok(approved.editRatio > 0.25);
  assert.equal(ledger.get(action.id).payload.draft, 'Completely rewritten message about something else entirely.');
  assert.equal(gate.get('system.demo').lastDemotionReason, 'heavy_edit');
  osDb.close();
});

test('failed actions retry 1, 5, 15 and 60 minutes later, then fail and alert', async () => {
  const { osDb, registry, ledger, clock, notifier } = setup();
  const action = await registry.request({ tool: 'research.flaky', payload: {}, why, idempotencyKey: 'f1' });
  await registry.executeDue();
  assert.equal(ledger.get(action.id).status, 'approved');
  assert.equal(ledger.get(action.id).nextAttemptAt, '2026-10-14T16:01:00.000Z');
  for (const minutes of [1, 5, 15, 60]) {
    clock.advance(minutes * 60_000);
    await registry.executeDue();
  }
  const failed = ledger.get(action.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.attempts, 5);
  assert.equal(notifier.calls.alerts.length, 1);
  assert.match(notifier.calls.alerts[0], /upstream down/);
  osDb.close();
});

test('pause stops all execution', async () => {
  const { osDb, registry, settings, ledger } = setup();
  const action = await registry.request({ tool: 'research.note', payload: { text: 'x' }, why, idempotencyKey: 'n1' });
  settings.set('os.paused', true);
  assert.deepEqual(await registry.executeDue(), { executed: 0, paused: true });
  assert.equal(ledger.get(action.id).status, 'approved');
  osDb.close();
});

test('a repeated request returns the existing action without notifying again', async () => {
  const { osDb, registry, notifier } = setup();
  const first = await registry.request({ tool: 'system.demo', payload: { draft: 'Hi' }, why, idempotencyKey: 'k1', urgent: true });
  const second = await registry.request({ tool: 'system.demo', payload: { draft: 'Hi' }, why, idempotencyKey: 'k1', urgent: true });
  assert.equal(second.id, first.id);
  assert.equal(notifier.calls.approvals.length, 1);
  osDb.close();
});

test('twenty clean approvals send one promotion offer', async () => {
  const { osDb, registry, notifier } = setup();
  for (let i = 0; i < 20; i += 1) {
    const action = await registry.request({ tool: 'email.follow_up', payload: { draft: 'Following up' }, why, idempotencyKey: `fu${i}` });
    await registry.approve(action.id);
  }
  assert.deepEqual(notifier.calls.offers, [{ actionType: 'email.follow_up', from: 'ask', to: 'tell' }]);
  osDb.close();
});

test('unknown tools and incomplete tools are rejected', async () => {
  const { osDb, registry } = setup();
  await assert.rejects(() => registry.request({ tool: 'nope', payload: {}, why, idempotencyKey: 'x' }), /Unknown tool/);
  assert.throws(() => registry.register({ name: 'broken' }), /missing actionType/);
  osDb.close();
});
