import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openOsDb } from '../lib/os/db.js';

test('migrations create the OTG-OS tables exactly once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'otg-os-db-'));
  const file = path.join(dir, 'os.sqlite');
  const first = openOsDb(file);
  const tables = first.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  for (const table of ['actions', 'autonomy_policies', 'schema_migrations', 'settings', 'spend']) {
    assert.ok(tables.includes(table), `missing table ${table}`);
  }
  first.close();
  const second = openOsDb(file);
  assert.equal(second.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 1);
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('transaction rolls back when the callback throws', () => {
  const osDb = openOsDb(':memory:');
  assert.throws(() => osDb.transaction(() => {
    osDb.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('x', '1', 't')").run();
    throw new Error('boom');
  }), /boom/);
  assert.equal(osDb.db.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 0);
  osDb.close();
});
