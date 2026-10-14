import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createHeartbeat } from '../lib/os/heartbeat.js';
import { createBackup } from '../lib/os/backup.js';

test('heartbeat posts the status to the ping URL and never throws', async () => {
  const calls = [];
  const ok = createHeartbeat({ url: 'https://hc.test/ping/abc', fetchImpl: async (url, init) => { calls.push({ url, body: init.body }); return { ok: true }; } });
  assert.equal(await ok.ping('ok'), true);
  assert.deepEqual(calls, [{ url: 'https://hc.test/ping/abc', body: 'ok' }]);
  const failing = createHeartbeat({ url: 'https://hc.test/ping/abc', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await failing.ping('ok'), false);
  assert.equal(await createHeartbeat({ url: '' }).ping('ok'), false);
});

test('backup copies the database and keeps only the newest files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otg-os-backup-'));
  const osDb = openOsDb(path.join(dir, 'os.sqlite'));
  createSettings(osDb).set('os.paused', true);
  let t = Date.parse('2026-10-14T10:00:00Z');
  const backup = createBackup({ osDb, dir: path.join(dir, 'backups'), keep: 2, now: () => new Date(t) });
  const files = [];
  for (let i = 0; i < 3; i += 1) {
    files.push(backup.run());
    t += 86_400_000;
  }
  const remaining = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.equal(remaining.length, 2);
  assert.equal(remaining[1], path.basename(files[2]));
  const copy = new DatabaseSync(files[2]);
  assert.equal(copy.prepare("SELECT value FROM settings WHERE key = 'os.paused'").get().value, 'true');
  copy.close();
  osDb.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
