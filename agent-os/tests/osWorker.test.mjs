import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createWorker } from '../lib/os/worker.js';

function setup(startIso, { failExecute = false } = {}) {
  let t = Date.parse(startIso);
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const calls = { executes: 0, flushes: 0, pings: [], backups: 0 };
  const registry = {
    async executeDue() { calls.executes += 1; if (failExecute) throw new Error('db locked'); return { executed: 0 }; },
    async flushPendingApprovals() { calls.flushes += 1; return 2; },
  };
  const heartbeat = { async ping(status) { calls.pings.push(status); return true; } };
  const backup = { run() { calls.backups += 1; return 'backup.sqlite'; } };
  const logs = [];
  const worker = createWorker({ settings, registry, heartbeat, backup }, { now: clock.now, log: (line) => logs.push(line) });
  return { osDb, settings, clock, calls, worker, logs };
}

test('approval bundles go out once at 9am, 1pm and 5pm Pacific', async () => {
  const { osDb, clock, calls, worker } = setup('2026-10-14T16:05:00Z');
  assert.equal((await worker.tick()).flushed, 2);
  await worker.tick();
  assert.equal(calls.flushes, 1);
  clock.set('2026-10-14T17:05:00Z');
  await worker.tick();
  assert.equal(calls.flushes, 1);
  clock.set('2026-10-14T20:01:00Z');
  await worker.tick();
  assert.equal(calls.flushes, 2);
  osDb.close();
});

test('heartbeat pings at most every five minutes and reports pause', async () => {
  const { osDb, clock, calls, worker, settings } = setup('2026-10-14T16:00:00Z');
  await worker.tick();
  clock.set('2026-10-14T16:03:00Z');
  await worker.tick();
  assert.equal(calls.pings.length, 1);
  settings.set('os.paused', true);
  clock.set('2026-10-14T16:05:00Z');
  await worker.tick();
  assert.deepEqual(calls.pings, ['ok', 'paused']);
  osDb.close();
});

test('backup runs once a day after 3am Pacific', async () => {
  const { osDb, clock, calls, worker } = setup('2026-10-14T09:00:00Z');
  await worker.tick();
  assert.equal(calls.backups, 0);
  clock.set('2026-10-14T10:30:00Z');
  await worker.tick();
  clock.set('2026-10-14T18:00:00Z');
  await worker.tick();
  assert.equal(calls.backups, 1);
  clock.set('2026-10-15T10:30:00Z');
  await worker.tick();
  assert.equal(calls.backups, 2);
  osDb.close();
});

test('a failing job does not stop the others', async () => {
  const { osDb, calls, worker, logs } = setup('2026-10-14T16:00:00Z', { failExecute: true });
  const report = await worker.tick();
  assert.equal(report.executed, 0);
  assert.equal(calls.pings.length, 1);
  assert.match(logs[0], /execute failed: db locked/);
  osDb.close();
});
