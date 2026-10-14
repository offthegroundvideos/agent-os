import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createLedger } from '../lib/os/ledger.js';

const why = { goal: 'Book shoot days', expected: 'Owner approves', evidence: ['test'] };

function setup() {
  let t = Date.parse('2026-10-14T16:00:00Z');
  const clock = { now: () => new Date(t), advance: (ms) => { t += ms; } };
  const osDb = openOsDb(':memory:');
  return { osDb, clock, ledger: createLedger(osDb, { now: clock.now }) };
}

function base(overrides = {}) {
  return { idempotencyKey: 'k1', actionType: 'system.demo', tool: 'system.demo', payload: { draft: 'Hello' }, why, autonomyLevel: 'ask', ...overrides };
}

test('ask actions start proposed; tell and silent start approved', () => {
  const { osDb, ledger } = setup();
  assert.equal(ledger.propose(base()).action.status, 'proposed');
  const tell = ledger.propose(base({ idempotencyKey: 'k2', autonomyLevel: 'tell' })).action;
  assert.equal(tell.status, 'approved');
  assert.equal(tell.approvedBy, 'auto');
  assert.equal(ledger.propose(base({ idempotencyKey: 'k3', autonomyLevel: 'silent' })).action.status, 'approved');
  osDb.close();
});

test('the same idempotency key never creates a second action', () => {
  const { osDb, ledger } = setup();
  const first = ledger.propose(base());
  const second = ledger.propose(base({ payload: { draft: 'Different' } }));
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.action.id, first.action.id);
  assert.equal(second.action.payload.draft, 'Hello');
  assert.equal(osDb.db.prepare('SELECT COUNT(*) AS n FROM actions').get().n, 1);
  osDb.close();
});

test('every action needs a goal and an expected result', () => {
  const { osDb, ledger } = setup();
  assert.throws(() => ledger.propose(base({ why: null })), /needs a why/);
  assert.throws(() => ledger.propose(base({ why: { expected: 'x' } })), /why.goal/);
  assert.throws(() => ledger.propose(base({ why: { goal: 'x' } })), /why.expected/);
  osDb.close();
});

test('approve stores who approved and the edit ratio, only for proposed actions', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base());
  const approved = ledger.approve(action.id, { by: 'owner', editRatio: 0.1 });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedBy, 'owner');
  assert.equal(approved.editRatio, 0.1);
  assert.throws(() => ledger.approve(action.id), /expected proposed/);
  osDb.close();
});

test('reject records the reason', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base());
  const rejected = ledger.reject(action.id, { reason: 'wrong_tone' });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectReason, 'wrong_tone');
  osDb.close();
});

test('revise replaces the payload, keeps the original draft and clears the Telegram message', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base());
  ledger.setTelegramMessage(action.id, 55);
  const revised = ledger.revise(action.id, { draft: 'Hello again' });
  assert.equal(revised.payload.draft, 'Hello again');
  assert.equal(revised.originalDraft, 'Hello');
  assert.equal(revised.telegramMessageId, null);
  osDb.close();
});

test('claimNextDue respects retry times and counts attempts', () => {
  const { osDb, ledger, clock } = setup();
  const { action } = ledger.propose(base({ autonomyLevel: 'silent' }));
  const claimed = ledger.claimNextDue();
  assert.equal(claimed.id, action.id);
  assert.equal(claimed.status, 'executing');
  assert.equal(claimed.attempts, 1);
  ledger.markFailed(action.id, 'timeout', { retryAt: new Date(clock.now().getTime() + 60_000).toISOString() });
  assert.equal(ledger.get(action.id).status, 'approved');
  assert.equal(ledger.claimNextDue(), null);
  clock.advance(61_000);
  assert.equal(ledger.claimNextDue().attempts, 2);
  const done = ledger.markDone(action.id, { ok: true });
  assert.equal(done.status, 'done');
  assert.deepEqual(done.result, { ok: true });
  assert.equal(done.executedAt, '2026-10-14T16:01:01.000Z');
  osDb.close();
});

test('markFailed without a retry time marks the action failed', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base({ autonomyLevel: 'silent' }));
  ledger.claimNextDue();
  const failed = ledger.markFailed(action.id, 'gave up');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.lastError, 'gave up');
  osDb.close();
});

test('recoverInterrupted returns executing actions to approved', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base({ autonomyLevel: 'silent' }));
  ledger.claimNextDue();
  assert.equal(ledger.recoverInterrupted(), 1);
  assert.equal(ledger.get(action.id).status, 'approved');
  osDb.close();
});

test('pendingUnsent lists proposed actions not yet sent to Telegram', () => {
  const { osDb, ledger } = setup();
  const one = ledger.propose(base()).action;
  const two = ledger.propose(base({ idempotencyKey: 'k2' })).action;
  ledger.setTelegramMessage(one.id, 10);
  assert.deepEqual(ledger.pendingUnsent().map((action) => action.id), [two.id]);
  osDb.close();
});

test('addCost accumulates micro-dollars and list filters by status', () => {
  const { osDb, ledger } = setup();
  const { action } = ledger.propose(base());
  ledger.addCost(action.id, 1500);
  ledger.addCost(action.id, 500);
  assert.equal(ledger.get(action.id).costMicros, 2000);
  assert.equal(ledger.list({ status: 'proposed' }).length, 1);
  assert.equal(ledger.list({ status: 'done' }).length, 0);
  osDb.close();
});

test('defer puts an executing action back without using up an attempt', () => {
  const osDb = openOsDb(':memory:');
  const ledger = createLedger(osDb);
  const { action } = ledger.propose({ idempotencyKey: 'd1', actionType: 'research.x', tool: 'research.x', why: { goal: 'g', expected: 'e' }, autonomyLevel: 'silent' });
  const claimed = ledger.claimNextDue();
  assert.equal(claimed.attempts, 1);
  const deferred = ledger.defer(action.id, '2099-01-01T00:00:00.000Z');
  assert.equal(deferred.status, 'approved');
  assert.equal(deferred.attempts, 0);
  assert.equal(deferred.nextAttemptAt, '2099-01-01T00:00:00.000Z');
  assert.equal(ledger.claimNextDue(), null);
  osDb.close();
});
