# OTG-OS Plan 1: Foundation and Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the always-on OTG-OS core (database, action ledger with the "why" record, budget caps, model router, approval gate, tool registry, worker process) and a Telegram bot where the owner approves, edits or rejects actions with buttons and asks questions in plain English.

**Architecture:** New code lives in `lib/os/` inside the existing `agent-os` Next.js project and shares one SQLite database (`data/otg-os.sqlite`, Node's built-in `node:sqlite`). A long-running worker process (`scripts/otg-os-worker.mjs`) polls Telegram, executes approved actions with retries, sends approval bundles, pings an outside heartbeat and backs up the database daily. Every unit is a small factory (`createX(...)`) that receives its dependencies, so tests inject fakes and an in-memory database.

**Tech Stack:** Node 24 (ESM `.js` files, `node:sqlite`, `node:test`), `@anthropic-ai/sdk` (Claude Sonnet 5.5 / Haiku 5.5 / Opus 5.5), local Ollama (`qwen3.5:9b`), Telegram Bot API over `fetch`, Windows Task Scheduler.

**Spec:** `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md` (milestones 1 and 2). Later plans cover the portfolio library, the Gig Engine, briefs and audit, and dashboard pages. The `/today` and `/pipeline` Telegram commands arrive with those plans.

---

## Working rules for this repository

- Run every command from `C:\AI-Agents\agent-os` unless a step says otherwise.
- The git repository root is `C:\AI-Agents`, and it has **many unrelated uncommitted changes, including staged deletions**. Never run a bare `git commit`. Always stage the exact files and commit with a pathspec: `git add <files> && git commit -m "..." -- <files>`.
- Tests use `node --test`. Run one file with `node --test tests/<file>.test.mjs`; run everything with `npm test`. The existing 31 tests must keep passing.
- Test files must be named `tests/<name>.test.mjs` (the `npm test` glob does not include subfolders).
- `lib/os/*.js` files are ES modules (Node 24 detects `import` syntax; no `"type": "module"` is needed, matching existing `lib/studioStore.js`).

## File structure

| File | Responsibility |
|---|---|
| `lib/os/time.js` | Pacific-time parts, date keys, quiet hours, UTC month/day starts |
| `lib/os/db.js` | Open the SQLite file, run numbered migrations, transaction helper |
| `lib/os/settings.js` | Typed settings with defaults, stored as JSON rows |
| `lib/os/editRatio.js` | Character edit distance and edit ratio between a draft and what was approved |
| `lib/os/ledger.js` | The action ledger: propose (idempotent), approve, reject, revise, claim, done, failed |
| `lib/os/budget.js` | Spend recording in micro-dollars, monthly cap states, daily tool caps |
| `lib/os/approvalGate.js` | Ask/Tell/Silent per action type, ceilings, promotion and demotion |
| `lib/os/providers/anthropic.js` | Claude Messages API call, normalized result |
| `lib/os/providers/ollama.js` | Local Ollama chat call, normalized result |
| `lib/os/modelRouter.js` | Task type → model chain, budget checks, fallbacks, spend recording |
| `lib/os/registry.js` | Tool registration, requests through the gate and ledger, approvals, execution with retries |
| `lib/os/tools/demo.js` | Harmless `system.demo` tool used to prove the approval loop |
| `lib/os/telegram/api.js` | Minimal Telegram Bot API client |
| `lib/os/telegram/format.js` | Message text and inline keyboards |
| `lib/os/telegram/notifier.js` | Notifier interface implemented for Telegram and for the console |
| `lib/os/telegram/bot.js` | Update handling: owner check, buttons, commands, edits, chat |
| `lib/os/brain/chat.js` | Claude answers owner questions using read-only ledger and budget tools |
| `lib/os/heartbeat.js` | Ping an outside Healthchecks.io URL |
| `lib/os/backup.js` | Daily `VACUUM INTO` copy of the database, keeps the newest 14 |
| `lib/os/worker.js` | One worker tick: execute due actions, approval bundles, heartbeat, backup |
| `lib/os/runtime.js` | Composition root: builds every unit from environment variables |
| `scripts/otg-os-worker.mjs` | The long-running worker process |
| `scripts/otg-os-demo-approval.mjs` | Creates one demo approval to test the Telegram loop |
| `scripts/install-otg-os-tasks.ps1` | Registers the worker and web server as Windows startup tasks |
| `tests/os*.test.mjs` | One test file per unit |

---

### Task 1: Add the Anthropic SDK and OTG-OS scripts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (by npm)
- Modify: `.env.example`

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: `added ... packages` and `package.json` gains `"@anthropic-ai/sdk"` under `dependencies`.

- [ ] **Step 2: Add npm scripts**

In `package.json`, add these two entries inside `"scripts"` after `"sync-context"` (add a comma after the `sync-context` line):

```json
    "os:worker": "node scripts/otg-os-worker.mjs",
    "os:demo": "node scripts/otg-os-demo-approval.mjs"
```

- [ ] **Step 3: Document the new environment variables**

Append to `.env.example`:

```
# OTG-OS core
OTG_OS_DB_FILE=
OTG_OS_BACKUP_DIR=
ANTHROPIC_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_ID=
HEALTHCHECKS_PING_URL=
OTG_BUSINESS_MAILING_ADDRESS=
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `npm test`
Expected: `ℹ pass 31` and `ℹ fail 0`.

- [ ] **Step 5: Commit**

`package.json` and `package-lock.json` already contain the earlier, uncommitted Next.js 16 upgrade that the app currently runs on; this commit records both.

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add Anthropic SDK and OTG-OS scripts (includes pending Next 16 upgrade)" -- package.json package-lock.json .env.example
```

---

### Task 2: Time helpers

**Files:**
- Create: `lib/os/time.js`
- Test: `tests/osTime.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osTime.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuietHour, pacificDateKey, pacificParts, utcDayStart, utcMonthStart } from '../lib/os/time.js';

test('pacific parts follow daylight saving time', () => {
  assert.deepEqual(pacificParts(new Date('2026-10-14T16:30:00Z')), { year: 2026, month: 10, day: 14, hour: 9, minute: 30 });
  assert.equal(pacificParts(new Date('2026-12-15T17:00:00Z')).hour, 9);
});

test('pacific date key uses the Pacific calendar day', () => {
  assert.equal(pacificDateKey(new Date('2026-10-15T05:00:00Z')), '2026-10-14');
});

test('quiet hours wrap past midnight', () => {
  const quiet = { start: 21, end: 7 };
  assert.equal(isQuietHour(new Date('2026-10-15T05:00:00Z'), quiet), true);
  assert.equal(isQuietHour(new Date('2026-10-14T16:00:00Z'), quiet), false);
  assert.equal(isQuietHour(new Date('2026-10-14T13:59:00Z'), quiet), true);
});

test('utc month and day starts', () => {
  assert.equal(utcMonthStart(new Date('2026-10-14T16:30:00Z')), '2026-10-01T00:00:00.000Z');
  assert.equal(utcDayStart(new Date('2026-10-14T16:30:00Z')), '2026-10-14T00:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osTime.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/time.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/time.js`:

```js
const PACIFIC = 'America/Los_Angeles';

export function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function pacificDateKey(date = new Date()) {
  const { year, month, day } = pacificParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isQuietHour(date, { start = 21, end = 7 } = {}) {
  const { hour } = pacificParts(date);
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function utcMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osTime.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/time.js tests/osTime.test.mjs
git commit -m "feat(os): add Pacific time helpers" -- lib/os/time.js tests/osTime.test.mjs
```

---

### Task 3: Database and migrations

**Files:**
- Create: `lib/os/db.js`
- Test: `tests/osDb.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osDb.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osDb.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/db.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/db.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  {
    id: 1,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE actions (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        action_type TEXT NOT NULL,
        tool TEXT NOT NULL,
        opportunity_id TEXT,
        payload TEXT NOT NULL,
        original_draft TEXT NOT NULL DEFAULT '',
        why TEXT NOT NULL,
        autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('ask', 'tell', 'silent')),
        status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'executing', 'done', 'failed')),
        urgent INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT NOT NULL DEFAULT '',
        reject_reason TEXT NOT NULL DEFAULT '',
        edit_ratio REAL,
        cost_micros INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT NOT NULL DEFAULT '',
        result TEXT,
        outcome TEXT,
        telegram_message_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        executed_at TEXT
      );
      CREATE INDEX actions_by_status ON actions (status, next_attempt_at);
      CREATE TABLE autonomy_policies (
        action_type TEXT PRIMARY KEY,
        level TEXT NOT NULL CHECK (level IN ('ask', 'tell', 'silent', 'never')),
        ceiling TEXT NOT NULL CHECK (ceiling IN ('ask', 'tell', 'silent', 'never')),
        consecutive_clean_approvals INTEGER NOT NULL DEFAULT 0,
        consecutive_rejections INTEGER NOT NULL DEFAULT 0,
        promotion_offered_at TEXT,
        last_demotion_reason TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE spend (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_or_tool TEXT NOT NULL,
        task_type TEXT NOT NULL,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        units INTEGER NOT NULL DEFAULT 0,
        cost_micros INTEGER NOT NULL DEFAULT 0,
        action_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX spend_by_time ON spend (created_at);
    `,
  },
];

export function openOsDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  for (const migration of MIGRATIONS) {
    transaction(() => {
      if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migration.id)) return;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString());
    });
  }

  return { db, transaction, close: () => db.close() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osDb.test.mjs`
Expected: PASS, 2 tests. (An `ExperimentalWarning: SQLite` line on stderr is normal.)

- [ ] **Step 5: Commit**

```bash
git add lib/os/db.js tests/osDb.test.mjs
git commit -m "feat(os): add SQLite database with migrations" -- lib/os/db.js tests/osDb.test.mjs
```

---

### Task 4: Settings

**Files:**
- Create: `lib/os/settings.js`
- Test: `tests/osSettings.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osSettings.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { DEFAULT_SETTINGS, createSettings } from '../lib/os/settings.js';

test('settings fall back to defaults and persist overrides', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  assert.equal(settings.get('budget.monthly_cap_cents'), 15000);
  settings.set('budget.monthly_cap_cents', 40000);
  assert.equal(settings.get('budget.monthly_cap_cents'), 40000);
  assert.equal(DEFAULT_SETTINGS['budget.monthly_cap_cents'], 15000);
  osDb.close();
});

test('defaults are returned as copies', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const caps = settings.get('budget.daily_tool_caps');
  caps.scrapecreators = 999;
  assert.equal(settings.get('budget.daily_tool_caps').scrapecreators, 20);
  osDb.close();
});

test('unknown keys are rejected', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  assert.throws(() => settings.get('nope'), /Unknown setting/);
  assert.throws(() => settings.set('nope', 1), /Unknown setting/);
  osDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osSettings.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/settings.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/settings.js`. Prices are dollars per million tokens, from the current Claude price list; unknown models are priced at the most expensive tier so spend is never under-counted.

```js
export const DEFAULT_SETTINGS = Object.freeze({
  'os.paused': false,
  'budget.monthly_cap_cents': 15000,
  'budget.warning_cents': 10000,
  'budget.daily_tool_caps': { scrapecreators: 20 },
  'models.prices': {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  'models.unknown_price': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'telegram.quiet_hours': { start: 21, end: 7 },
  'telegram.bundle_hours': [9, 13, 17],
  'telegram.update_offset': 0,
  'telegram.pending_edit_action_id': '',
  'telegram.last_bundle': '',
  'executor.retry_minutes': [1, 5, 15, 60],
  'heartbeat.last_ping_at': '',
  'backup.last_date': '',
});

export function createSettings({ db }) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?');
  const write = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);

  function assertKnown(key) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error(`Unknown setting: ${key}`);
  }

  function get(key) {
    assertKnown(key);
    const row = read.get(key);
    return row ? JSON.parse(row.value) : structuredClone(DEFAULT_SETTINGS[key]);
  }

  function set(key, value) {
    assertKnown(key);
    write.run(key, JSON.stringify(value), new Date().toISOString());
    return value;
  }

  return { get, set };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osSettings.test.mjs`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/settings.js tests/osSettings.test.mjs
git commit -m "feat(os): add typed settings with defaults" -- lib/os/settings.js tests/osSettings.test.mjs
```

---

### Task 5: Edit ratio

**Files:**
- Create: `lib/os/editRatio.js`
- Test: `tests/osEditRatio.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osEditRatio.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, editRatio } from '../lib/os/editRatio.js';

test('edit distance counts insertions, deletions and substitutions', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('same', 'same'), 0);
});

test('edit ratio is distance over draft length, capped at 1', () => {
  assert.equal(editRatio('hello world', 'hello world'), 0);
  assert.equal(editRatio('abcd', 'abxd'), 0.25);
  assert.equal(editRatio('', 'anything'), 1);
  assert.equal(editRatio('', ''), 0);
  assert.equal(editRatio('ab', 'completely different'), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osEditRatio.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/editRatio.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/editRatio.js`:

```js
export function editDistance(a = '', b = '') {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

export function editRatio(draft = '', sent = '') {
  if (!draft.length) return sent.length ? 1 : 0;
  return Math.min(1, Math.round((editDistance(draft, sent) / draft.length) * 1000) / 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osEditRatio.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/editRatio.js tests/osEditRatio.test.mjs
git commit -m "feat(os): add edit ratio for approval edits" -- lib/os/editRatio.js tests/osEditRatio.test.mjs
```

---

### Task 6: Action ledger

**Files:**
- Create: `lib/os/ledger.js`
- Test: `tests/osLedger.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osLedger.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osLedger.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/ledger.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/ledger.js`. Tools must be safe to re-run for the same action ID, because `recoverInterrupted` re-queues actions that were executing when the worker stopped.

```js
import { randomUUID } from 'node:crypto';

export class LedgerError extends Error {}

export const AUTONOMY_LEVELS = ['ask', 'tell', 'silent'];

function parseJson(value) {
  return value == null ? null : JSON.parse(value);
}

function rowToAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    actionType: row.action_type,
    tool: row.tool,
    opportunityId: row.opportunity_id,
    payload: JSON.parse(row.payload),
    originalDraft: row.original_draft,
    why: JSON.parse(row.why),
    autonomyLevel: row.autonomy_level,
    status: row.status,
    urgent: row.urgent === 1,
    approvedBy: row.approved_by,
    rejectReason: row.reject_reason,
    editRatio: row.edit_ratio,
    costMicros: row.cost_micros,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    result: parseJson(row.result),
    outcome: parseJson(row.outcome),
    telegramMessageId: row.telegram_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    executedAt: row.executed_at,
  };
}

function cleanWhy(why) {
  if (!why || typeof why !== 'object') throw new LedgerError('Every action needs a why.');
  const goal = String(why.goal ?? '').trim();
  const expected = String(why.expected ?? '').trim();
  if (!goal) throw new LedgerError('why.goal is required.');
  if (!expected) throw new LedgerError('why.expected is required.');
  const evidence = Array.isArray(why.evidence) ? why.evidence.map((item) => String(item)) : [];
  return { goal, expected, evidence };
}

export function createLedger({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const selectById = db.prepare('SELECT * FROM actions WHERE id = ?');
  const selectByKey = db.prepare('SELECT * FROM actions WHERE idempotency_key = ?');

  function get(id) {
    return rowToAction(selectById.get(id));
  }

  function requireStatus(id, allowed) {
    const action = get(id);
    if (!action) throw new LedgerError(`Action not found: ${id}`);
    if (!allowed.includes(action.status)) {
      throw new LedgerError(`Action ${id} is ${action.status}; expected ${allowed.join(' or ')}.`);
    }
    return action;
  }

  function propose({ idempotencyKey, actionType, tool, payload = {}, why, autonomyLevel, opportunityId = null, urgent = false }) {
    if (!String(idempotencyKey ?? '').trim()) throw new LedgerError('idempotencyKey is required.');
    if (!AUTONOMY_LEVELS.includes(autonomyLevel)) throw new LedgerError(`Invalid autonomy level: ${autonomyLevel}`);
    const reason = cleanWhy(why);
    return transaction(() => {
      const existing = selectByKey.get(idempotencyKey);
      if (existing) return { action: rowToAction(existing), created: false };
      const id = `act_${randomUUID()}`;
      const time = stamp();
      const status = autonomyLevel === 'ask' ? 'proposed' : 'approved';
      db.prepare(`INSERT INTO actions (id, idempotency_key, action_type, tool, opportunity_id, payload, original_draft, why,
          autonomy_level, status, urgent, approved_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, idempotencyKey, actionType, tool, opportunityId, JSON.stringify(payload), String(payload.draft ?? ''),
          JSON.stringify(reason), autonomyLevel, status, urgent ? 1 : 0, status === 'approved' ? 'auto' : '', time, time);
      return { action: get(id), created: true };
    });
  }

  function approve(id, { by = 'owner', editRatio = 0 } = {}) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare("UPDATE actions SET status = 'approved', approved_by = ?, edit_ratio = ?, updated_at = ? WHERE id = ?")
        .run(by, editRatio, stamp(), id);
      return get(id);
    });
  }

  function reject(id, { reason = 'other' } = {}) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare("UPDATE actions SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?")
        .run(reason, stamp(), id);
      return get(id);
    });
  }

  function revise(id, payload) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare('UPDATE actions SET payload = ?, telegram_message_id = NULL, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(payload), stamp(), id);
      return get(id);
    });
  }

  function claimNextDue() {
    return transaction(() => {
      const row = db.prepare(`SELECT id FROM actions WHERE status = 'approved'
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at, id LIMIT 1`).get(stamp());
      if (!row) return null;
      db.prepare("UPDATE actions SET status = 'executing', attempts = attempts + 1, updated_at = ? WHERE id = ?")
        .run(stamp(), row.id);
      return get(row.id);
    });
  }

  function markDone(id, result = {}) {
    return transaction(() => {
      requireStatus(id, ['executing']);
      const time = stamp();
      db.prepare(`UPDATE actions SET status = 'done', result = ?, last_error = '', next_attempt_at = NULL,
          executed_at = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(result), time, time, id);
      return get(id);
    });
  }

  function markFailed(id, error, { retryAt = null } = {}) {
    return transaction(() => {
      requireStatus(id, ['executing']);
      const status = retryAt ? 'approved' : 'failed';
      db.prepare('UPDATE actions SET status = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?')
        .run(status, String(error).slice(0, 2000), retryAt, stamp(), id);
      return get(id);
    });
  }

  function recoverInterrupted() {
    const result = db.prepare(`UPDATE actions SET status = 'approved', last_error = 'interrupted by restart', updated_at = ?
      WHERE status = 'executing'`).run(stamp());
    return Number(result.changes);
  }

  function addCost(id, micros) {
    db.prepare('UPDATE actions SET cost_micros = cost_micros + ? WHERE id = ?').run(Math.round(micros), id);
  }

  function setTelegramMessage(id, messageId) {
    db.prepare('UPDATE actions SET telegram_message_id = ? WHERE id = ?').run(messageId, id);
  }

  function list({ status = null, limit = 20 } = {}) {
    const rows = status
      ? db.prepare('SELECT * FROM actions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(status, limit)
      : db.prepare('SELECT * FROM actions ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
    return rows.map(rowToAction);
  }

  function pendingUnsent() {
    return db.prepare(`SELECT * FROM actions WHERE status = 'proposed' AND telegram_message_id IS NULL
      ORDER BY created_at, id`).all().map(rowToAction);
  }

  return {
    get, propose, approve, reject, revise, claimNextDue, markDone, markFailed,
    recoverInterrupted, addCost, setTelegramMessage, list, pendingUnsent,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osLedger.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/ledger.js tests/osLedger.test.mjs
git commit -m "feat(os): add action ledger with why record and idempotency" -- lib/os/ledger.js tests/osLedger.test.mjs
```

---

### Task 7: Budget

**Files:**
- Create: `lib/os/budget.js`
- Test: `tests/osBudget.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osBudget.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osBudget.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/budget.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/budget.js`:

```js
import { utcDayStart, utcMonthStart } from './time.js';

export const MICROS_PER_CENT = 10_000;

export function formatDollars(micros) {
  return `$${(Number(micros) / 1_000_000).toFixed(2)}`;
}

export function createBudget({ db }, settings, { now = () => new Date() } = {}) {
  function priceFor(model) {
    return settings.get('models.prices')[model] ?? settings.get('models.unknown_price');
  }

  function costMicros(model, usage = {}) {
    const price = priceFor(model);
    return Math.round(
      (usage.inputTokens ?? 0) * price.input
      + (usage.outputTokens ?? 0) * price.output
      + (usage.cacheReadTokens ?? 0) * price.cacheRead
      + (usage.cacheWriteTokens ?? 0) * price.cacheWrite,
    );
  }

  function record({ provider, modelOrTool, taskType, tokensIn = 0, tokensOut = 0, units = 0, costMicros: cost = 0, actionId = null }) {
    db.prepare(`INSERT INTO spend (provider, model_or_tool, task_type, tokens_in, tokens_out, units, cost_micros, action_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(provider, modelOrTool, taskType, tokensIn, tokensOut, units, Math.round(cost), actionId, now().toISOString());
  }

  function monthToDateMicros() {
    return db.prepare('SELECT COALESCE(SUM(cost_micros), 0) AS total FROM spend WHERE created_at >= ?')
      .get(utcMonthStart(now())).total;
  }

  function status() {
    const spentMicros = monthToDateMicros();
    const capMicros = settings.get('budget.monthly_cap_cents') * MICROS_PER_CENT;
    const warningMicros = settings.get('budget.warning_cents') * MICROS_PER_CENT;
    const state = spentMicros >= capMicros ? 'capped' : spentMicros >= warningMicros ? 'warning' : 'ok';
    return { spentMicros, capMicros, warningMicros, state };
  }

  function canUsePaid() {
    return status().state !== 'capped';
  }

  function toolUnitsToday(tool) {
    return db.prepare('SELECT COALESCE(SUM(units), 0) AS total FROM spend WHERE model_or_tool = ? AND created_at >= ?')
      .get(tool, utcDayStart(now())).total;
  }

  function canUseTool(tool, units = 1) {
    if (!canUsePaid()) return false;
    const cap = settings.get('budget.daily_tool_caps')[tool];
    return cap == null || toolUnitsToday(tool) + units <= cap;
  }

  return { costMicros, record, monthToDateMicros, status, canUsePaid, toolUnitsToday, canUseTool };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osBudget.test.mjs`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/budget.js tests/osBudget.test.mjs
git commit -m "feat(os): add budget with monthly cap and daily tool caps" -- lib/os/budget.js tests/osBudget.test.mjs
```

---

### Task 8: Approval gate

**Files:**
- Create: `lib/os/approvalGate.js`
- Test: `tests/osApprovalGate.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osApprovalGate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createApprovalGate, PROMOTION_THRESHOLD } from '../lib/os/approvalGate.js';

function setup() {
  const osDb = openOsDb(':memory:');
  return { osDb, gate: createApprovalGate(osDb) };
}

test('starting levels follow the spec table', () => {
  const { osDb, gate } = setup();
  assert.equal(gate.levelFor('research.prospect_list'), 'silent');
  assert.equal(gate.levelFor('calendar.hold'), 'tell');
  assert.equal(gate.levelFor('email.first_contact'), 'ask');
  assert.equal(gate.levelFor('quote.large_or_custom'), 'ask');
  assert.equal(gate.levelFor('something.unknown'), 'ask');
  assert.equal(gate.get('something.unknown').ceiling, 'ask');
  osDb.close();
});

test('20 clean approvals offer one promotion', () => {
  const { osDb, gate } = setup();
  for (let i = 1; i < PROMOTION_THRESHOLD; i += 1) {
    assert.equal(gate.recordApproval('email.follow_up', 0).promotionOffer, null);
  }
  const offer = gate.recordApproval('email.follow_up', 0).promotionOffer;
  assert.deepEqual(offer, { actionType: 'email.follow_up', from: 'ask', to: 'tell' });
  assert.equal(gate.recordApproval('email.follow_up', 0).promotionOffer, null);
  assert.equal(gate.promote('email.follow_up').level, 'tell');
  assert.equal(gate.get('email.follow_up').cleanApprovals, 0);
  osDb.close();
});

test('first contact can never be promoted', () => {
  const { osDb, gate } = setup();
  for (let i = 0; i < 25; i += 1) {
    assert.equal(gate.recordApproval('email.first_contact', 0).promotionOffer, null);
  }
  assert.throws(() => gate.promote('email.first_contact'), /ceiling/);
  osDb.close();
});

test('a small edit resets the clean streak and a heavy edit demotes to ask', () => {
  const { osDb, gate } = setup();
  gate.promote('email.follow_up');
  gate.recordApproval('email.follow_up', 0);
  const small = gate.recordApproval('email.follow_up', 0.1);
  assert.equal(small.policy.cleanApprovals, 0);
  assert.equal(small.policy.level, 'tell');
  const heavy = gate.recordApproval('email.follow_up', 0.3);
  assert.equal(heavy.demoted, true);
  assert.equal(heavy.policy.level, 'ask');
  assert.equal(heavy.policy.lastDemotionReason, 'heavy_edit');
  osDb.close();
});

test('two rejections in a row demote to ask', () => {
  const { osDb, gate } = setup();
  gate.promote('email.follow_up');
  assert.equal(gate.recordRejection('email.follow_up').demoted, false);
  const second = gate.recordRejection('email.follow_up');
  assert.equal(second.demoted, true);
  assert.equal(second.policy.level, 'ask');
  assert.equal(second.policy.lastDemotionReason, 'repeated_rejections');
  osDb.close();
});

test('declining a promotion restarts the count', () => {
  const { osDb, gate } = setup();
  for (let i = 0; i < PROMOTION_THRESHOLD; i += 1) gate.recordApproval('quote.standard', 0);
  const policy = gate.declinePromotion('quote.standard');
  assert.equal(policy.level, 'ask');
  assert.equal(policy.cleanApprovals, 0);
  assert.equal(policy.promotionOfferedAt, null);
  osDb.close();
});

test('demote is available for outside triggers like bounces', () => {
  const { osDb, gate } = setup();
  gate.promote('calendar.hold');
  assert.equal(gate.demote('calendar.hold', 'bounce_spike').level, 'ask');
  assert.equal(gate.list().find((policy) => policy.actionType === 'calendar.hold').lastDemotionReason, 'bounce_spike');
  osDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osApprovalGate.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/approvalGate.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/approvalGate.js`. Unknown action types are always `ask` with an `ask` ceiling, so anything new is safe by default.

```js
const ORDER = ['ask', 'tell', 'silent'];

export const PROMOTION_THRESHOLD = 20;
export const HEAVY_EDIT_RATIO = 0.25;

export const DEFAULT_POLICIES = Object.freeze({
  research: { level: 'silent', ceiling: 'silent' },
  'calendar.hold': { level: 'tell', ceiling: 'silent' },
  'email.first_contact': { level: 'ask', ceiling: 'ask' },
  'email.follow_up': { level: 'ask', ceiling: 'silent' },
  'email.portfolio_send': { level: 'ask', ceiling: 'silent' },
  'quote.standard': { level: 'ask', ceiling: 'silent' },
  'quote.large_or_custom': { level: 'ask', ceiling: 'ask' },
  'email.booking_confirmation': { level: 'ask', ceiling: 'silent' },
  'booking.cancel': { level: 'ask', ceiling: 'ask' },
  'payment.refund': { level: 'ask', ceiling: 'ask' },
  'system.demo': { level: 'ask', ceiling: 'ask' },
});

const UNKNOWN_POLICY = { level: 'ask', ceiling: 'ask' };

export function defaultPolicyFor(actionType) {
  return DEFAULT_POLICIES[actionType] ?? DEFAULT_POLICIES[actionType.split('.')[0]] ?? UNKNOWN_POLICY;
}

function toPolicy(row) {
  return {
    actionType: row.action_type,
    level: row.level,
    ceiling: row.ceiling,
    cleanApprovals: row.consecutive_clean_approvals,
    rejections: row.consecutive_rejections,
    promotionOfferedAt: row.promotion_offered_at,
    lastDemotionReason: row.last_demotion_reason,
  };
}

function nextLevel(policy) {
  const index = ORDER.indexOf(policy.level);
  const ceilingIndex = ORDER.indexOf(policy.ceiling);
  if (index === -1 || ceilingIndex === -1 || index >= ceilingIndex) return null;
  return ORDER[index + 1];
}

export function createApprovalGate({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const select = db.prepare('SELECT * FROM autonomy_policies WHERE action_type = ?');

  function ensure(actionType) {
    const existing = select.get(actionType);
    if (existing) return existing;
    const policy = defaultPolicyFor(actionType);
    db.prepare('INSERT OR IGNORE INTO autonomy_policies (action_type, level, ceiling, updated_at) VALUES (?, ?, ?, ?)')
      .run(actionType, policy.level, policy.ceiling, stamp());
    return select.get(actionType);
  }

  function get(actionType) {
    return toPolicy(ensure(actionType));
  }

  function levelFor(actionType) {
    return ensure(actionType).level;
  }

  function demote(actionType, reason) {
    ensure(actionType);
    db.prepare(`UPDATE autonomy_policies SET level = CASE WHEN level = 'never' THEN 'never' ELSE 'ask' END,
        consecutive_clean_approvals = 0, consecutive_rejections = 0, promotion_offered_at = NULL,
        last_demotion_reason = ?, updated_at = ? WHERE action_type = ?`)
      .run(reason, stamp(), actionType);
    return get(actionType);
  }

  function recordApproval(actionType, editRatio = 0) {
    return transaction(() => {
      const before = get(actionType);
      if (editRatio > HEAVY_EDIT_RATIO) {
        const policy = demote(actionType, 'heavy_edit');
        return { policy, demoted: before.level !== 'ask', promotionOffer: null };
      }
      const clean = editRatio === 0 ? before.cleanApprovals + 1 : 0;
      db.prepare(`UPDATE autonomy_policies SET consecutive_clean_approvals = ?, consecutive_rejections = 0, updated_at = ?
        WHERE action_type = ?`).run(clean, stamp(), actionType);
      const policy = get(actionType);
      const to = nextLevel(policy);
      if (to && clean >= PROMOTION_THRESHOLD && !policy.promotionOfferedAt) {
        db.prepare('UPDATE autonomy_policies SET promotion_offered_at = ? WHERE action_type = ?').run(stamp(), actionType);
        return { policy: get(actionType), demoted: false, promotionOffer: { actionType, from: policy.level, to } };
      }
      return { policy, demoted: false, promotionOffer: null };
    });
  }

  function recordRejection(actionType) {
    return transaction(() => {
      const before = get(actionType);
      const rejections = before.rejections + 1;
      if (rejections >= 2) {
        const policy = demote(actionType, 'repeated_rejections');
        return { policy, demoted: before.level !== 'ask' };
      }
      db.prepare(`UPDATE autonomy_policies SET consecutive_rejections = ?, consecutive_clean_approvals = 0, updated_at = ?
        WHERE action_type = ?`).run(rejections, stamp(), actionType);
      return { policy: get(actionType), demoted: false };
    });
  }

  function promote(actionType) {
    const policy = get(actionType);
    const to = nextLevel(policy);
    if (!to) throw new Error(`${actionType} is already at its ceiling (${policy.ceiling}).`);
    db.prepare(`UPDATE autonomy_policies SET level = ?, consecutive_clean_approvals = 0, promotion_offered_at = NULL,
        updated_at = ? WHERE action_type = ?`).run(to, stamp(), actionType);
    return get(actionType);
  }

  function declinePromotion(actionType) {
    ensure(actionType);
    db.prepare(`UPDATE autonomy_policies SET consecutive_clean_approvals = 0, promotion_offered_at = NULL, updated_at = ?
      WHERE action_type = ?`).run(stamp(), actionType);
    return get(actionType);
  }

  function list() {
    return db.prepare('SELECT * FROM autonomy_policies ORDER BY action_type').all().map(toPolicy);
  }

  return { levelFor, get, recordApproval, recordRejection, promote, declinePromotion, demote, list };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osApprovalGate.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/approvalGate.js tests/osApprovalGate.test.mjs
git commit -m "feat(os): add approval gate with earned autonomy" -- lib/os/approvalGate.js tests/osApprovalGate.test.mjs
```

---

### Task 9: Model providers

**Files:**
- Create: `lib/os/providers/anthropic.js`
- Create: `lib/os/providers/ollama.js`
- Test: `tests/osProviders.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osProviders.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider } from '../lib/os/providers/anthropic.js';
import { createOllamaProvider } from '../lib/os/providers/ollama.js';

function fakeResponse(model) {
  return {
    model,
    content: [{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 },
  };
}

function fakeClient(calls) {
  return {
    messages: { create: async (params) => { calls.push(['plain', params]); return fakeResponse(params.model); } },
    beta: { messages: { create: async (params) => { calls.push(['beta', params]); return fakeResponse(params.model); } } },
  };
}

test('anthropic provider normalizes text, usage and stop reason', async () => {
  const calls = [];
  const provider = createAnthropicProvider({ client: fakeClient(calls) });
  const result = await provider.complete({ model: 'claude-haiku-5-5', system: 'sys', messages: [{ role: 'user', content: 'hi' }], effort: 'low' });
  assert.equal(result.text, 'Hello');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(result.model, 'claude-haiku-5-5');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 3, cacheReadTokens: 4, cacheWriteTokens: 0 });
  assert.equal(calls[0][0], 'plain');
  assert.equal(calls[0][1].system, 'sys');
  assert.deepEqual(calls[0][1].output_config, { effort: 'low' });
  assert.equal(calls[0][1].max_tokens, 16000);
});

test('sonnet and opus requests opt into server-side refusal fallbacks', async () => {
  const calls = [];
  const provider = createAnthropicProvider({ client: fakeClient(calls) });
  await provider.complete({ model: 'claude-sonnet-5-5', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(calls[0][0], 'beta');
  assert.deepEqual(calls[0][1].betas, ['server-side-fallback-2026-07-01']);
  assert.equal(calls[0][1].fallbacks, 'default');
  assert.equal('output_config' in calls[0][1], false);
});

test('ollama provider flattens messages, strips think blocks and reports tokens', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ message: { content: '<think>plan</think>Hi there' }, prompt_eval_count: 12, eval_count: 5 }) };
  };
  const provider = createOllamaProvider({ baseUrl: 'http://ollama.test', fetchImpl });
  const result = await provider.complete({
    model: 'qwen3.5:9b',
    system: 'Be brief',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  });
  assert.equal(result.text, 'Hi there');
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 });
  assert.equal(requests[0].url, 'http://ollama.test/api/chat');
  assert.deepEqual(requests[0].body.messages, [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Hello' }]);
  assert.equal(requests[0].body.stream, false);
});

test('ollama provider raises on HTTP errors', async () => {
  const provider = createOllamaProvider({ baseUrl: 'http://ollama.test', fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(() => provider.complete({ model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'x' }] }), /Ollama error 500/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osProviders.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/providers/anthropic.js`.

- [ ] **Step 3: Write the Anthropic provider**

Create `lib/os/providers/anthropic.js`. Sonnet 5.5 and Opus 5.5 calls include Anthropic's server-side refusal fallback (`fallbacks: "default"`), which reroutes a safety-declined request to another model within the same call.

```js
import Anthropic from '@anthropic-ai/sdk';

export const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

export function normalizeAnthropicResponse(response) {
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return {
    text,
    content: response.content,
    stopReason: response.stop_reason,
    model: response.model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cacheReadTokens: response.usage?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

export function createAnthropicProvider({ client, apiKey } = {}) {
  const anthropic = client ?? new Anthropic({ apiKey });
  return {
    name: 'anthropic',
    async complete({ model, system, messages, tools, maxTokens = 16000, effort }) {
      const params = { model, max_tokens: maxTokens, messages };
      if (system) params.system = system;
      if (tools?.length) params.tools = tools;
      if (effort) params.output_config = { effort };
      const response = FALLBACK_MODELS.has(model)
        ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await anthropic.messages.create(params);
      return normalizeAnthropicResponse(response);
    },
  };
}
```

- [ ] **Step 4: Write the Ollama provider**

Create `lib/os/providers/ollama.js`:

```js
const THINK_BLOCK = /<think>[\s\S]*?<\/think>\s*/g;

function flatten(content) {
  if (typeof content === 'string') return content;
  return (content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

export function createOllamaProvider({ baseUrl = 'http://localhost:11434', fetchImpl = fetch, timeoutMs = 300_000 } = {}) {
  return {
    name: 'ollama',
    async complete({ model, system, messages, maxTokens = 2048 }) {
      const body = {
        model,
        stream: false,
        think: false,
        keep_alive: '10m',
        options: { num_predict: maxTokens },
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages.map((message) => ({ role: message.role, content: flatten(message.content) })),
        ],
      };
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Ollama error ${response.status}`);
      const data = await response.json();
      const text = String(data.message?.content ?? '').replace(THINK_BLOCK, '').trim();
      return {
        text,
        content: [{ type: 'text', text }],
        stopReason: 'end_turn',
        model,
        usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/osProviders.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/os/providers/anthropic.js lib/os/providers/ollama.js tests/osProviders.test.mjs
git commit -m "feat(os): add Claude and Ollama model providers" -- lib/os/providers/anthropic.js lib/os/providers/ollama.js tests/osProviders.test.mjs
```

---

### Task 10: Model router

**Files:**
- Create: `lib/os/modelRouter.js`
- Test: `tests/osModelRouter.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osModelRouter.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createBudget } from '../lib/os/budget.js';
import { createModelRouter, RouterError } from '../lib/os/modelRouter.js';

function fakeProvider(name, behavior) {
  const calls = [];
  return {
    calls,
    name,
    async complete(request) {
      calls.push(request);
      if (behavior === 'fail') throw new Error(`${name} down`);
      return {
        text: `${name} says hi`,
        content: [{ type: 'text', text: `${name} says hi` }],
        stopReason: 'end_turn',
        model: request.model,
        usage: { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
      };
    },
  };
}

function setup({ anthropic = 'ok', ollama = 'ok' } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const budget = createBudget(osDb, settings);
  const providers = { anthropic: fakeProvider('anthropic', anthropic), ollama: fakeProvider('ollama', ollama) };
  return { osDb, budget, providers, router: createModelRouter({ providers, budget }) };
}

const spendRows = (osDb) => osDb.db.prepare('SELECT * FROM spend ORDER BY id').all();

test('chat goes to Claude Sonnet at low effort and records spend', async () => {
  const { osDb, providers, router } = setup();
  const result = await router.run('chat', { messages: [{ role: 'user', content: 'hi' }] }, { actionId: 'act_1' });
  assert.equal(result.provider, 'anthropic');
  assert.equal(result.costMicros, 3000);
  assert.equal(providers.anthropic.calls[0].model, 'claude-sonnet-5-5');
  assert.equal(providers.anthropic.calls[0].effort, 'low');
  const [row] = spendRows(osDb);
  assert.equal(row.cost_micros, 3000);
  assert.equal(row.task_type, 'chat');
  assert.equal(row.action_id, 'act_1');
  osDb.close();
});

test('drafts fall back to the local model when Claude fails and are flagged for review', async () => {
  const { osDb, router } = setup({ anthropic: 'fail' });
  const result = await router.run('draft', { messages: [{ role: 'user', content: 'write' }] });
  assert.equal(result.provider, 'ollama');
  assert.equal(result.needsReview, true);
  assert.equal(result.costMicros, 0);
  assert.equal(spendRows(osDb)[0].provider, 'ollama');
  osDb.close();
});

test('paid models are skipped once the monthly cap is reached', async () => {
  const { osDb, budget, providers, router } = setup();
  budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'chat', costMicros: 150_000_000 });
  const result = await router.run('draft', { messages: [{ role: 'user', content: 'write' }] });
  assert.equal(result.provider, 'ollama');
  assert.equal(providers.anthropic.calls.length, 0);
  osDb.close();
});

test('decisions never fall back to the local model', async () => {
  const { osDb, providers, router } = setup({ anthropic: 'fail' });
  await assert.rejects(() => router.run('decision', { messages: [{ role: 'user', content: 'plan' }] }), RouterError);
  assert.equal(providers.ollama.calls.length, 0);
  osDb.close();
});

test('missing providers and unknown task types give clear errors', async () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const router = createModelRouter({ providers: {}, budget: createBudget(osDb, settings) });
  await assert.rejects(() => router.run('chat', { messages: [] }), /anthropic not configured/);
  await assert.rejects(() => router.run('nonsense', { messages: [] }), /unknown task type/);
  osDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osModelRouter.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/modelRouter.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/modelRouter.js`. The `classify` route uses Claude Haiku now; Jev replaces it when access arrives. Grok and Codex routes arrive with later plans.

```js
export class RouterError extends Error {
  constructor(taskType, failures) {
    super(`No model could complete "${taskType}": ${failures.join('; ') || 'no routes'}`);
    this.name = 'RouterError';
    this.taskType = taskType;
    this.failures = failures;
  }
}

export const DEFAULT_ROUTES = Object.freeze({
  decision: [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }],
  chat: [{ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'low' }],
  draft: [
    { provider: 'anthropic', model: 'claude-sonnet-5-5' },
    { provider: 'ollama', model: 'qwen3.5:9b', needsReview: true },
  ],
  classify: [{ provider: 'anthropic', model: 'claude-haiku-5-5' }],
  bulk: [
    { provider: 'ollama', model: 'qwen3.5:9b' },
    { provider: 'anthropic', model: 'claude-haiku-5-5' },
  ],
  daily_audit: [{ provider: 'anthropic', model: 'claude-sonnet-5-5' }],
  sunday_audit: [
    { provider: 'anthropic', model: 'claude-opus-5-5' },
    { provider: 'anthropic', model: 'claude-sonnet-5-5' },
  ],
});

const FREE_PROVIDERS = new Set(['ollama']);

export function createModelRouter({ providers, budget, routes = DEFAULT_ROUTES }) {
  async function run(taskType, request, { actionId = null } = {}) {
    const chain = routes[taskType];
    if (!chain) throw new RouterError(taskType, [`unknown task type "${taskType}"`]);
    const failures = [];
    for (const route of chain) {
      const provider = providers[route.provider];
      if (!provider) {
        failures.push(`${route.provider} not configured`);
        continue;
      }
      const paid = !FREE_PROVIDERS.has(route.provider);
      if (paid && !budget.canUsePaid()) {
        failures.push('monthly budget cap reached');
        continue;
      }
      try {
        const result = await provider.complete({ ...request, model: route.model, effort: request.effort ?? route.effort });
        const costMicros = paid ? budget.costMicros(result.model, result.usage) : 0;
        budget.record({
          provider: route.provider,
          modelOrTool: result.model,
          taskType,
          tokensIn: result.usage.inputTokens,
          tokensOut: result.usage.outputTokens,
          costMicros,
          actionId,
        });
        return { ...result, provider: route.provider, costMicros, needsReview: Boolean(route.needsReview) };
      } catch (error) {
        failures.push(`${route.provider}/${route.model}: ${error?.message ?? error}`);
      }
    }
    throw new RouterError(taskType, failures);
  }

  return { run };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osModelRouter.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/modelRouter.js tests/osModelRouter.test.mjs
git commit -m "feat(os): add model router with budget-aware fallbacks" -- lib/os/modelRouter.js tests/osModelRouter.test.mjs
```

---

### Task 11: Tool registry and demo tool

**Files:**
- Create: `lib/os/registry.js`
- Create: `lib/os/tools/demo.js`
- Test: `tests/osRegistry.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osRegistry.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osRegistry.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/registry.js`.

- [ ] **Step 3: Write the demo tool**

Create `lib/os/tools/demo.js`:

```js
export const demoTool = {
  name: 'system.demo',
  actionType: 'system.demo',
  describe: (payload) => `Demo action: ${payload.draft}`,
  async execute(payload) {
    return { echoed: payload.draft };
  },
};
```

- [ ] **Step 4: Write the registry**

Create `lib/os/registry.js`. A tool is `{ name, actionType, describe(payload), execute(payload, { action }), revise?(payload, instruction) }`. Ask-level payloads carry the text the owner reviews in `payload.draft`. The notifier is `{ requestApproval(action, description) → messageId | null, tell, alert, offerPromotion }`.

```js
import { editRatio as measureEditRatio } from './editRatio.js';

export class RegistryError extends Error {}

const REQUIRED_TOOL_FIELDS = ['name', 'actionType', 'describe', 'execute'];

export function createRegistry({ ledger, gate, settings, notifier, now = () => new Date() }) {
  const tools = new Map();

  function register(tool) {
    for (const field of REQUIRED_TOOL_FIELDS) {
      if (!tool?.[field]) throw new RegistryError(`Tool is missing ${field}.`);
    }
    tools.set(tool.name, tool);
  }

  function toolFor(action) {
    const tool = tools.get(action.tool);
    if (!tool) throw new RegistryError(`No tool registered for ${action.tool}.`);
    return tool;
  }

  function describe(action) {
    return toolFor(action).describe(action.payload);
  }

  async function presentApproval(action) {
    const messageId = await notifier.requestApproval(action, describe(action));
    if (messageId != null) ledger.setTelegramMessage(action.id, messageId);
  }

  async function request({ tool: name, payload = {}, why, idempotencyKey, opportunityId = null, urgent = false }) {
    const tool = tools.get(name);
    if (!tool) throw new RegistryError(`Unknown tool: ${name}`);
    const level = gate.levelFor(tool.actionType);
    if (level === 'never') throw new RegistryError(`${tool.actionType} is not allowed.`);
    const { action, created } = ledger.propose({
      idempotencyKey, actionType: tool.actionType, tool: name, payload, why, autonomyLevel: level, opportunityId, urgent,
    });
    if (created && level === 'ask' && urgent) await presentApproval(action);
    return ledger.get(action.id);
  }

  async function flushPendingApprovals() {
    const pending = ledger.pendingUnsent();
    for (const action of pending) await presentApproval(action);
    return pending.length;
  }

  async function approve(actionId, { by = 'owner' } = {}) {
    const action = ledger.get(actionId);
    if (!action) throw new RegistryError(`Action not found: ${actionId}`);
    const ratio = measureEditRatio(action.originalDraft, String(action.payload.draft ?? ''));
    const approved = ledger.approve(actionId, { by, editRatio: ratio });
    const { promotionOffer } = gate.recordApproval(action.actionType, ratio);
    if (promotionOffer) await notifier.offerPromotion(promotionOffer);
    return approved;
  }

  async function reject(actionId, { reason = 'other' } = {}) {
    const rejected = ledger.reject(actionId, { reason });
    gate.recordRejection(rejected.actionType);
    return rejected;
  }

  async function revise(actionId, instruction) {
    const action = ledger.get(actionId);
    if (!action || action.status !== 'proposed') throw new RegistryError('Only actions waiting for approval can be edited.');
    const tool = toolFor(action);
    const payload = tool.revise
      ? await tool.revise(action.payload, instruction)
      : { ...action.payload, draft: String(instruction) };
    const revised = ledger.revise(actionId, payload);
    await presentApproval(revised);
    return ledger.get(actionId);
  }

  async function executeDue({ limit = 10 } = {}) {
    if (settings.get('os.paused')) return { executed: 0, paused: true };
    const retryMinutes = settings.get('executor.retry_minutes');
    let executed = 0;
    while (executed < limit) {
      const action = ledger.claimNextDue();
      if (!action) break;
      executed += 1;
      try {
        const tool = toolFor(action);
        const result = await tool.execute(action.payload, { action });
        ledger.markDone(action.id, result ?? {});
        if (action.autonomyLevel === 'tell') await notifier.tell(action, tool.describe(action.payload));
      } catch (error) {
        const message = String(error?.message ?? error);
        if (action.attempts <= retryMinutes.length) {
          const retryAt = new Date(now().getTime() + retryMinutes[action.attempts - 1] * 60_000).toISOString();
          ledger.markFailed(action.id, message, { retryAt });
        } else {
          ledger.markFailed(action.id, message);
          await notifier.alert(`${action.actionType} failed after ${action.attempts} attempts: ${message}`);
        }
      }
    }
    return { executed, paused: false };
  }

  return { register, describe, request, presentApproval, flushPendingApprovals, approve, reject, revise, executeDue };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/osRegistry.test.mjs`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/os/registry.js lib/os/tools/demo.js tests/osRegistry.test.mjs
git commit -m "feat(os): add tool registry with approvals, edits and retries" -- lib/os/registry.js lib/os/tools/demo.js tests/osRegistry.test.mjs
```

---

### Task 12: Telegram API client, message formats and notifiers

**Files:**
- Create: `lib/os/telegram/api.js`
- Create: `lib/os/telegram/format.js`
- Create: `lib/os/telegram/notifier.js`
- Test: `tests/osTelegramApi.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osTelegramApi.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramApi } from '../lib/os/telegram/api.js';
import { approvalKeyboard, approvalText, promotionKeyboard, rejectReasonKeyboard, truncate } from '../lib/os/telegram/format.js';
import { createConsoleNotifier, createTelegramNotifier } from '../lib/os/telegram/notifier.js';

test('telegram api posts JSON to the bot endpoint and returns the result', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { json: async () => ({ ok: true, result: { message_id: 7 } }) };
  };
  const api = createTelegramApi({ token: 'T0K', fetchImpl });
  const result = await api.sendMessage(42, 'hi', { inline_keyboard: [] });
  assert.equal(result.message_id, 7);
  assert.equal(calls[0].url, 'https://api.telegram.org/botT0K/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: 42, text: 'hi', reply_markup: { inline_keyboard: [] } });
  await api.getUpdates(5, 25);
  assert.deepEqual(calls[1].body, { offset: 5, timeout: 25, allowed_updates: ['message', 'callback_query'] });
});

test('telegram api throws with the error description', async () => {
  const api = createTelegramApi({ token: 'T0K', fetchImpl: async () => ({ json: async () => ({ ok: false, description: 'Bad Request: chat not found' }) }) });
  await assert.rejects(() => api.sendMessage(1, 'x'), /chat not found/);
});

const action = {
  id: 'act_123e4567-e89b-12d3-a456-426614174000',
  actionType: 'email.follow_up',
  why: { goal: 'Book a Napa winery', expected: 'Reply within a week', evidence: ['Hosts weddings', 'Active Instagram'] },
};

test('approval text shows the description and the why', () => {
  const text = approvalText(action, 'Follow up with Napa Valley Estate');
  assert.match(text, /Approval needed · email\.follow_up/);
  assert.match(text, /Follow up with Napa Valley Estate/);
  assert.match(text, /Why: Book a Napa winery/);
  assert.match(text, /Expected: Reply within a week/);
  assert.match(text, /Evidence: Hosts weddings; Active Instagram/);
});

test('button data stays under Telegram 64-byte limit', () => {
  const buttons = [
    ...approvalKeyboard(action.id).inline_keyboard.flat(),
    ...rejectReasonKeyboard(action.id).inline_keyboard.flat(),
    ...promotionKeyboard('email.booking_confirmation').inline_keyboard.flat(),
  ];
  for (const button of buttons) assert.ok(Buffer.byteLength(button.callback_data) <= 64, button.callback_data);
});

test('truncate keeps messages under the limit', () => {
  assert.equal(truncate('x'.repeat(5000)).length, 3500);
  assert.equal(truncate('short'), 'short');
});

test('telegram notifier sends approvals with buttons and returns the message id', async () => {
  const sent = [];
  const api = { async sendMessage(chatId, text, keyboard) { sent.push({ chatId, text, keyboard }); return { message_id: 99 }; } };
  const notifier = createTelegramNotifier({ api, ownerId: 42 });
  assert.equal(await notifier.requestApproval(action, 'Follow up'), 99);
  assert.equal(sent[0].chatId, 42);
  assert.equal(sent[0].keyboard.inline_keyboard[0].length, 3);
  await notifier.offerPromotion({ actionType: 'email.follow_up', from: 'ask', to: 'tell' });
  assert.match(sent[1].text, /from Ask to Tell/);
});

test('console notifier logs and returns no message id', async () => {
  const lines = [];
  const notifier = createConsoleNotifier((line) => lines.push(line));
  assert.equal(await notifier.requestApproval(action, 'Follow up'), null);
  assert.match(lines[0], /approval needed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osTelegramApi.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/telegram/api.js`.

- [ ] **Step 3: Write the API client**

Create `lib/os/telegram/api.js`. Messages are sent as plain text (no `parse_mode`) so business names with special characters never break formatting.

```js
export function createTelegramApi({ token, fetchImpl = fetch }) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, body, timeoutMs = 30_000) {
    const response = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? 'unknown error'}`);
    return data.result;
  }

  return {
    getUpdates: (offset, timeout = 25) =>
      call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }, (timeout + 10) * 1000),
    sendMessage: (chatId, text, replyMarkup) =>
      call('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    editMessageText: (chatId, messageId, text) =>
      call('editMessageText', { chat_id: chatId, message_id: messageId, text }),
    answerCallbackQuery: (callbackQueryId, text) =>
      call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  };
}
```

- [ ] **Step 4: Write the message formats**

Create `lib/os/telegram/format.js`:

```js
const MESSAGE_LIMIT = 3500;

export const LEVEL_LABELS = { ask: 'Ask', tell: 'Tell', silent: 'Silent', never: 'Never' };

export const REJECT_REASONS = {
  wrong_target: 'Wrong target',
  wrong_tone: 'Wrong tone',
  bad_timing: 'Bad timing',
  other: 'Other',
};

export function truncate(text, max = MESSAGE_LIMIT) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function approvalText(action, description) {
  const lines = [
    `🟡 Approval needed · ${action.actionType}`,
    '',
    description,
    '',
    `Why: ${action.why.goal}`,
    `Expected: ${action.why.expected}`,
  ];
  if (action.why.evidence?.length) lines.push(`Evidence: ${action.why.evidence.join('; ')}`);
  return truncate(lines.join('\n'));
}

export function approvalKeyboard(actionId) {
  return {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `a:${actionId}` },
      { text: '✏️ Edit', callback_data: `e:${actionId}` },
      { text: '❌ Reject', callback_data: `r:${actionId}` },
    ]],
  };
}

export function rejectReasonKeyboard(actionId) {
  return {
    inline_keyboard: Object.entries(REJECT_REASONS).map(([key, label]) => [{ text: label, callback_data: `rr:${actionId}:${key}` }]),
  };
}

export function promotionKeyboard(actionType) {
  return {
    inline_keyboard: [[
      { text: '⬆️ Yes, promote', callback_data: `p:${actionType}` },
      { text: 'Keep asking', callback_data: `k:${actionType}` },
    ]],
  };
}
```

- [ ] **Step 5: Write the notifiers**

Create `lib/os/telegram/notifier.js`:

```js
import { approvalKeyboard, approvalText, LEVEL_LABELS, promotionKeyboard, truncate } from './format.js';

export function createTelegramNotifier({ api, ownerId }) {
  const send = (text, keyboard) => api.sendMessage(ownerId, truncate(text), keyboard);
  return {
    async requestApproval(action, description) {
      const message = await send(approvalText(action, description), approvalKeyboard(action.id));
      return message.message_id;
    },
    async tell(action, description) {
      await send(`✅ Done · ${action.actionType}\n\n${description}`);
    },
    async alert(text) {
      await send(`⚠️ ${text}`);
    },
    async offerPromotion({ actionType, from, to }) {
      await send(
        `I've had 20 approvals in a row with no edits for ${actionType}. Move it from ${LEVEL_LABELS[from]} to ${LEVEL_LABELS[to]}?`,
        promotionKeyboard(actionType),
      );
    },
  };
}

export function createConsoleNotifier(log = console.log) {
  return {
    async requestApproval(action, description) {
      log(`[approval needed] ${action.id} ${description}`);
      return null;
    },
    async tell(action, description) {
      log(`[done] ${action.actionType}: ${description}`);
    },
    async alert(text) {
      log(`[alert] ${text}`);
    },
    async offerPromotion({ actionType, from, to }) {
      log(`[promotion offer] ${actionType}: ${from} -> ${to}`);
    },
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test tests/osTelegramApi.test.mjs`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/os/telegram/api.js lib/os/telegram/format.js lib/os/telegram/notifier.js tests/osTelegramApi.test.mjs
git commit -m "feat(os): add Telegram API client, formats and notifiers" -- lib/os/telegram/api.js lib/os/telegram/format.js lib/os/telegram/notifier.js tests/osTelegramApi.test.mjs
```

---

### Task 13: Owner chat (Claude with read-only tools)

**Files:**
- Create: `lib/os/brain/chat.js`
- Test: `tests/osChat.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osChat.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { CHAT_TOOLS, createChat } from '../lib/os/brain/chat.js';

function setup(responses) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const budget = createBudget(osDb, settings);
  const gate = createApprovalGate(osDb);
  const router = {
    calls: [],
    async run(taskType, request) {
      this.calls.push({ taskType, request: structuredClone(request) });
      return responses.shift();
    },
  };
  return { osDb, ledger, router, chat: createChat({ router, ledger, budget, gate, settings }) };
}

test('chat answers by calling read-only tools through the chat route', async () => {
  const { osDb, router, chat } = setup([
    { stopReason: 'tool_use', text: '', content: [{ type: 'tool_use', id: 'tu_1', name: 'get_budget_status', input: {} }] },
    { stopReason: 'end_turn', text: 'You have spent $0.00 of $150.00.', content: [{ type: 'text', text: 'You have spent $0.00 of $150.00.' }] },
  ]);
  const answer = await chat.ask('How much have we spent?');
  assert.equal(answer, 'You have spent $0.00 of $150.00.');
  assert.equal(router.calls[0].taskType, 'chat');
  assert.equal(router.calls[0].request.tools.length, CHAT_TOOLS.length);
  const toolResult = router.calls[1].request.messages[2].content[0];
  assert.equal(toolResult.type, 'tool_result');
  assert.equal(toolResult.tool_use_id, 'tu_1');
  assert.match(toolResult.content, /\$150\.00/);
  osDb.close();
});

test('every chat tool has a strict schema that disallows extra fields', () => {
  for (const tool of CHAT_TOOLS) {
    assert.equal(tool.strict, true, tool.name);
    assert.equal(tool.input_schema.additionalProperties, false, tool.name);
  }
});

test('pending approvals are visible to chat', () => {
  const { osDb, ledger, chat } = setup([]);
  ledger.propose({ idempotencyKey: 'k1', actionType: 'system.demo', tool: 'system.demo', payload: { draft: 'Hi' }, why: { goal: 'Test', expected: 'Approve' }, autonomyLevel: 'ask' });
  const pending = chat.runTool('list_pending_approvals', {});
  assert.equal(pending.length, 1);
  assert.equal(pending[0].goal, 'Test');
  assert.equal(chat.runTool('list_recent_actions', { limit: 500 }).length, 1);
  assert.deepEqual(chat.runTool('nope', {}), { error: 'Unknown tool nope' });
  osDb.close();
});

test('refusals and step limits give plain answers', async () => {
  const refusal = setup([{ stopReason: 'refusal', text: '', content: [] }]);
  assert.equal(await refusal.chat.ask('x'), 'I can’t help with that one.');
  refusal.osDb.close();
  const loop = Array.from({ length: 5 }, (_, index) => ({
    stopReason: 'tool_use', text: '', content: [{ type: 'tool_use', id: `tu_${index}`, name: 'get_system_status', input: {} }],
  }));
  const looping = setup(loop);
  assert.match(await looping.chat.ask('x'), /ran out of steps/);
  looping.osDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osChat.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/brain/chat.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/brain/chat.js`. Tools use `strict: true` with no numeric bounds (limits are clamped in code), and `tool_choice` is left at its default because Sonnet 5.5 does not accept forced tool choice.

```js
import { formatDollars } from '../budget.js';

export const CHAT_SYSTEM = [
  'You are OTG-OS, the operating assistant for OFF THE GROUND (MadeByOTG.com), a photo, video and drone production company based in Fairfax, California, run by Jack Riggs.',
  'You are talking with Jack in Telegram on his phone. Answer in a few short sentences.',
  'Use the tools to look up facts. Never invent numbers, bookings, clients or results; if the tools do not have it, say so plainly.',
].join(' ');

const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false };

export const CHAT_TOOLS = [
  { name: 'get_budget_status', description: 'Month-to-date AI and data spend, the monthly cap, and whether paid calls are allowed.', strict: true, input_schema: NO_INPUT },
  { name: 'list_pending_approvals', description: 'Actions waiting for Jack to approve, edit or reject.', strict: true, input_schema: NO_INPUT },
  {
    name: 'list_recent_actions',
    description: 'The most recent actions in the ledger with their status and the reason they were taken. limit is 1 to 20.',
    strict: true,
    input_schema: { type: 'object', properties: { limit: { type: 'integer' } }, required: ['limit'], additionalProperties: false },
  },
  { name: 'list_autonomy_levels', description: 'The current autonomy level (Ask, Tell or Silent) and ceiling for each action type.', strict: true, input_schema: NO_INPUT },
  { name: 'get_system_status', description: 'Whether OTG-OS is paused.', strict: true, input_schema: NO_INPUT },
];

function summarize(action) {
  return { id: action.id, type: action.actionType, status: action.status, goal: action.why.goal, expected: action.why.expected, created: action.createdAt };
}

export function createChat({ router, ledger, budget, gate, settings, maxSteps = 5 }) {
  function runTool(name, input = {}) {
    switch (name) {
      case 'get_budget_status': {
        const status = budget.status();
        return { spent: formatDollars(status.spentMicros), cap: formatDollars(status.capMicros), state: status.state };
      }
      case 'list_pending_approvals':
        return ledger.list({ status: 'proposed', limit: 20 }).map(summarize);
      case 'list_recent_actions':
        return ledger.list({ limit: Math.min(20, Math.max(1, Number(input.limit) || 10)) }).map(summarize);
      case 'list_autonomy_levels':
        return gate.list().map((policy) => ({ actionType: policy.actionType, level: policy.level, ceiling: policy.ceiling }));
      case 'get_system_status':
        return { paused: settings.get('os.paused') };
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  async function ask(question) {
    const messages = [{ role: 'user', content: String(question) }];
    for (let step = 0; step < maxSteps; step += 1) {
      const response = await router.run('chat', { system: CHAT_SYSTEM, messages, tools: CHAT_TOOLS, maxTokens: 4000 });
      if (response.stopReason === 'refusal') return 'I can’t help with that one.';
      if (response.stopReason !== 'tool_use') return response.text.trim() || 'I don’t have an answer for that yet.';
      messages.push({ role: 'assistant', content: response.content });
      const results = response.content
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(runTool(block.name, block.input)) }));
      messages.push({ role: 'user', content: results });
    }
    return 'I ran out of steps on that one. Try a narrower question.';
  }

  return { ask, runTool };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osChat.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/brain/chat.js tests/osChat.test.mjs
git commit -m "feat(os): add owner chat with read-only tools" -- lib/os/brain/chat.js tests/osChat.test.mjs
```

---

### Task 14: Telegram bot

**Files:**
- Create: `lib/os/telegram/bot.js`
- Test: `tests/osTelegramBot.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osTelegramBot.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createRegistry } from '../lib/os/registry.js';
import { demoTool } from '../lib/os/tools/demo.js';
import { createTelegramNotifier } from '../lib/os/telegram/notifier.js';
import { createTelegramBot } from '../lib/os/telegram/bot.js';

function fakeApi() {
  let nextId = 100;
  return {
    sent: [],
    edits: [],
    answers: [],
    updates: [],
    async sendMessage(chatId, text, keyboard) { this.sent.push({ chatId, text, keyboard }); return { message_id: nextId++ }; },
    async editMessageText(chatId, messageId, text) { this.edits.push({ chatId, messageId, text }); return true; },
    async answerCallbackQuery(id, text) { this.answers.push({ id, text }); return true; },
    async getUpdates() { const updates = this.updates; this.updates = []; return updates; },
  };
}

function setup({ ownerId = 42 } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const gate = createApprovalGate(osDb);
  const budget = createBudget(osDb, settings);
  const api = fakeApi();
  const notifier = createTelegramNotifier({ api, ownerId: 42 });
  const registry = createRegistry({ ledger, gate, settings, notifier });
  registry.register(demoTool);
  const questions = [];
  const chat = { async ask(question) { questions.push(question); return `answer: ${question}`; } };
  const bot = createTelegramBot({ api, ownerId, settings, ledger, registry, gate, budget, chat, log: () => {} });
  return { osDb, settings, ledger, gate, api, registry, bot, questions };
}

const fromOwner = (text, updateId = 1) => ({ update_id: updateId, message: { message_id: 1, from: { id: 42 }, chat: { id: 42 }, text } });
const press = (data, messageId = 500) => ({
  update_id: 2,
  callback_query: { id: 'cb1', from: { id: 42 }, data, message: { message_id: messageId, chat: { id: 42 }, text: 'approval text' } },
});
const propose = (registry, key = 'k1') => registry.request({
  tool: 'system.demo', payload: { draft: 'Hello there' }, why: { goal: 'Test', expected: 'Approved' }, idempotencyKey: key, urgent: true,
});

test('messages from anyone but the owner are ignored', async () => {
  const { osDb, api, bot } = setup();
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, from: { id: 999 }, chat: { id: 999 }, text: '/status' } });
  assert.equal(api.sent.length, 0);
  osDb.close();
});

test('without an owner ID the bot tells the sender their ID', async () => {
  const { osDb, api, bot } = setup({ ownerId: null });
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, from: { id: 777 }, chat: { id: 777 }, text: '/start' } });
  assert.equal(api.sent[0].chatId, 777);
  assert.match(api.sent[0].text, /TELEGRAM_OWNER_ID=777/);
  osDb.close();
});

test('the approve button approves and marks the message', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.equal(ledger.get(action.id).status, 'approved');
  assert.match(api.edits[0].text, /Approved/);
  assert.equal(api.answers[0].text, 'Approved');
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.match(api.answers[1].text, /expected proposed/);
  osDb.close();
});

test('the reject button asks why, then records the reason', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  const approvalMessageId = ledger.get(action.id).telegramMessageId;
  await bot.handleUpdate(press(`r:${action.id}`));
  assert.equal(api.sent.at(-1).text, 'Why are you rejecting it?');
  await bot.handleUpdate(press(`rr:${action.id}:wrong_tone`, 600));
  const rejected = ledger.get(action.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectReason, 'wrong_tone');
  const editedIds = api.edits.map((edit) => edit.messageId);
  assert.ok(editedIds.includes(600));
  assert.ok(editedIds.includes(approvalMessageId));
  osDb.close();
});

test('edit flow: the next message becomes the new draft and is re-sent', async () => {
  const { osDb, api, bot, ledger, registry, settings } = setup();
  const action = await propose(registry);
  await bot.handleUpdate(press(`e:${action.id}`));
  assert.equal(settings.get('telegram.pending_edit_action_id'), action.id);
  await bot.handleUpdate(fromOwner('New text please'));
  assert.equal(settings.get('telegram.pending_edit_action_id'), '');
  assert.equal(ledger.get(action.id).payload.draft, 'New text please');
  assert.match(api.sent.at(-1).text, /New text please/);
  osDb.close();
});

test('pause and resume toggle the pause flag', async () => {
  const { osDb, bot, settings } = setup();
  await bot.handleUpdate(fromOwner('/pause'));
  assert.equal(settings.get('os.paused'), true);
  await bot.handleUpdate(fromOwner('/resume'));
  assert.equal(settings.get('os.paused'), false);
  osDb.close();
});

test('budget and status commands report spend and waiting approvals', async () => {
  const { osDb, api, bot, registry } = setup();
  await propose(registry);
  await bot.handleUpdate(fromOwner('/budget'));
  assert.match(api.sent.at(-1).text, /\$0\.00 of \$150\.00/);
  assert.match(api.sent.at(-1).text, /scrapecreators: 0 of 20 today/);
  await bot.handleUpdate(fromOwner('/status'));
  assert.match(api.sent.at(-1).text, /Approvals waiting: 1/);
  osDb.close();
});

test('approvals command re-sends everything waiting', async () => {
  const { osDb, api, bot, registry } = setup();
  await propose(registry, 'k1');
  await propose(registry, 'k2');
  const before = api.sent.length;
  await bot.handleUpdate(fromOwner('/approvals'));
  assert.equal(api.sent.length, before + 2);
  osDb.close();
});

test('plain text goes to the owner chat', async () => {
  const { osDb, api, bot, questions } = setup();
  await bot.handleUpdate(fromOwner('What is booked this week?'));
  assert.deepEqual(questions, ['What is booked this week?']);
  assert.equal(api.sent.at(-1).text, 'answer: What is booked this week?');
  osDb.close();
});

test('the promote button raises the autonomy level', async () => {
  const { osDb, bot, gate } = setup();
  await bot.handleUpdate(press('p:calendar.hold'));
  assert.equal(gate.get('calendar.hold').level, 'silent');
  osDb.close();
});

test('pollOnce advances the offset even when an update fails', async () => {
  const { osDb, api, bot, settings } = setup();
  api.updates = [fromOwner('/status', 10), { update_id: 11, message: { from: { id: 42 }, text: 'no chat field' } }];
  assert.equal(await bot.pollOnce(0), 2);
  assert.equal(settings.get('telegram.update_offset'), 12);
  osDb.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osTelegramBot.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/telegram/bot.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/telegram/bot.js`:

```js
import { formatDollars } from '../budget.js';
import { approvalText, LEVEL_LABELS, REJECT_REASONS, rejectReasonKeyboard, truncate } from './format.js';

export const HELP_TEXT = [
  'OTG-OS commands:',
  '/status – running or paused, approvals waiting, failures',
  '/approvals – show everything waiting for you',
  '/budget – AI and data spend this month',
  '/pause – stop all outgoing actions now',
  '/resume – start again',
  '/cancel – cancel an edit in progress',
  'Anything else you type is a question for OTG-OS.',
].join('\n');

export function createTelegramBot({ api, ownerId, settings, ledger, registry, gate, budget, chat, log = console.error }) {
  const send = (chatId, text, keyboard) => api.sendMessage(chatId, truncate(text), keyboard);

  async function safeEdit(chatId, messageId, text) {
    if (!messageId) return;
    try {
      await api.editMessageText(chatId, messageId, truncate(text));
    } catch (error) {
      log(`Telegram edit failed: ${error.message}`);
    }
  }

  function statusText() {
    const spend = budget.status();
    return [
      settings.get('os.paused') ? '⏸ OTG-OS is paused.' : '▶️ OTG-OS is running.',
      `Approvals waiting: ${ledger.list({ status: 'proposed', limit: 100 }).length}`,
      `Failed actions: ${ledger.list({ status: 'failed', limit: 100 }).length}`,
      `Spend this month: ${formatDollars(spend.spentMicros)} of ${formatDollars(spend.capMicros)} (${spend.state})`,
    ].join('\n');
  }

  function budgetText() {
    const spend = budget.status();
    const caps = settings.get('budget.daily_tool_caps');
    return [
      `Spend this month: ${formatDollars(spend.spentMicros)} of ${formatDollars(spend.capMicros)} cap.`,
      `Warning at ${formatDollars(spend.warningMicros)}. State: ${spend.state}.`,
      ...Object.entries(caps).map(([tool, cap]) => `${tool}: ${budget.toolUnitsToday(tool)} of ${cap} today`),
    ].join('\n');
  }

  async function handleCallback(query) {
    const chatId = query.message?.chat?.id ?? ownerId;
    const messageId = query.message?.message_id;
    const [kind, target, extra] = String(query.data ?? '').split(':');
    try {
      if (kind === 'a') {
        await registry.approve(target);
        await safeEdit(chatId, messageId, `${query.message?.text ?? ''}\n\n✅ Approved. It runs within a minute.`);
        await api.answerCallbackQuery(query.id, 'Approved');
        return;
      }
      if (kind === 'r') {
        await send(chatId, 'Why are you rejecting it?', rejectReasonKeyboard(target));
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'rr') {
        const action = await registry.reject(target, { reason: extra });
        const label = REJECT_REASONS[extra] ?? 'Other';
        await safeEdit(chatId, messageId, `❌ Rejected (${label}).`);
        await safeEdit(chatId, action.telegramMessageId, `${approvalText(action, registry.describe(action))}\n\n❌ Rejected (${label}).`);
        await api.answerCallbackQuery(query.id, 'Rejected');
        return;
      }
      if (kind === 'e') {
        const action = ledger.get(target);
        if (!action || action.status !== 'proposed') throw new Error('That action is no longer waiting for approval.');
        settings.set('telegram.pending_edit_action_id', target);
        await send(chatId, 'Send the new text for this draft, or /cancel.');
        await api.answerCallbackQuery(query.id);
        return;
      }
      if (kind === 'p') {
        const policy = gate.promote(target);
        await safeEdit(chatId, messageId, `⬆️ ${target} now runs at ${LEVEL_LABELS[policy.level]}.`);
        await api.answerCallbackQuery(query.id, 'Promoted');
        return;
      }
      if (kind === 'k') {
        const policy = gate.declinePromotion(target);
        await safeEdit(chatId, messageId, `👍 ${target} stays at ${LEVEL_LABELS[policy.level]}.`);
        await api.answerCallbackQuery(query.id, 'Kept');
        return;
      }
      await api.answerCallbackQuery(query.id, 'Unknown button');
    } catch (error) {
      await api.answerCallbackQuery(query.id, String(error.message).slice(0, 190));
    }
  }

  async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = String(message.text ?? '').trim();
    if (!text) return;
    const command = text.startsWith('/') ? text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '') : '';
    const pendingEdit = settings.get('telegram.pending_edit_action_id');

    if (pendingEdit && !command) {
      settings.set('telegram.pending_edit_action_id', '');
      const before = ledger.get(pendingEdit);
      await safeEdit(chatId, before?.telegramMessageId, '✏️ Edited. The new version is below.');
      await registry.revise(pendingEdit, text);
      return;
    }

    switch (command) {
      case '/start':
      case '/help':
        await send(chatId, HELP_TEXT);
        return;
      case '/status':
        await send(chatId, statusText());
        return;
      case '/budget':
        await send(chatId, budgetText());
        return;
      case '/approvals': {
        const waiting = ledger.list({ status: 'proposed', limit: 20 }).reverse();
        if (!waiting.length) {
          await send(chatId, 'Nothing is waiting for you.');
          return;
        }
        for (const action of waiting) await registry.presentApproval(action);
        return;
      }
      case '/pause':
        settings.set('os.paused', true);
        await send(chatId, '⏸ Paused. Nothing outgoing will run until /resume.');
        return;
      case '/resume':
        settings.set('os.paused', false);
        await send(chatId, '▶️ Running again.');
        return;
      case '/cancel':
        settings.set('telegram.pending_edit_action_id', '');
        await send(chatId, 'Edit cancelled.');
        return;
      case '':
        break;
      default:
        await send(chatId, `I don't know ${command}.\n\n${HELP_TEXT}`);
        return;
    }

    try {
      await send(chatId, await chat.ask(text));
    } catch (error) {
      await send(chatId, `I can't answer right now: ${error.message}`);
    }
  }

  async function handleUpdate(update) {
    const from = update.message?.from ?? update.callback_query?.from;
    if (!from) return;
    if (!ownerId) {
      if (update.message) {
        await send(update.message.chat.id, `Your Telegram user ID is ${from.id}. Add TELEGRAM_OWNER_ID=${from.id} to .env.local and restart the OTG-OS worker.`);
      }
      return;
    }
    if (from.id !== ownerId) {
      log(`Ignored Telegram update from user ${from.id}`);
      return;
    }
    if (update.callback_query) return handleCallback(update.callback_query);
    if (update.message) return handleMessage(update.message);
  }

  async function pollOnce(timeoutSeconds = 25) {
    const updates = await api.getUpdates(settings.get('telegram.update_offset'), timeoutSeconds);
    for (const update of updates) {
      settings.set('telegram.update_offset', update.update_id + 1);
      try {
        await handleUpdate(update);
      } catch (error) {
        log(`Telegram update ${update.update_id} failed: ${error.message}`);
      }
    }
    return updates.length;
  }

  return { handleUpdate, pollOnce, statusText, budgetText };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osTelegramBot.test.mjs`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/telegram/bot.js tests/osTelegramBot.test.mjs
git commit -m "feat(os): add Telegram bot with approvals, edits and commands" -- lib/os/telegram/bot.js tests/osTelegramBot.test.mjs
```

---

### Task 15: Heartbeat and backup

**Files:**
- Create: `lib/os/heartbeat.js`
- Create: `lib/os/backup.js`
- Test: `tests/osHeartbeatBackup.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osHeartbeatBackup.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osHeartbeatBackup.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/heartbeat.js`.

- [ ] **Step 3: Write the heartbeat**

Create `lib/os/heartbeat.js`:

```js
export function createHeartbeat({ url = '', fetchImpl = fetch } = {}) {
  return {
    async ping(status = 'ok') {
      if (!url) return false;
      try {
        await fetchImpl(url, { method: 'POST', body: status, signal: AbortSignal.timeout(10_000) });
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 4: Write the backup**

Create `lib/os/backup.js`. Pointing `OTG_OS_BACKUP_DIR` at a cloud-synced folder (Google Drive for desktop or OneDrive) makes this an off-machine backup.

```js
import fs from 'node:fs';
import path from 'node:path';

export function createBackup({ osDb, dir, keep = 14, now = () => new Date() }) {
  function run() {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `otg-os-${stamp}.sqlite`);
    osDb.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const backups = fs.readdirSync(dir).filter((name) => /^otg-os-.*\.sqlite$/.test(name)).sort();
    for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
    return file;
  }
  return { run };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/osHeartbeatBackup.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/os/heartbeat.js lib/os/backup.js tests/osHeartbeatBackup.test.mjs
git commit -m "feat(os): add outside heartbeat and daily database backup" -- lib/os/heartbeat.js lib/os/backup.js tests/osHeartbeatBackup.test.mjs
```

---

### Task 16: Worker tick

**Files:**
- Create: `lib/os/worker.js`
- Test: `tests/osWorker.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osWorker.test.mjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osWorker.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/worker.js`.

- [ ] **Step 3: Write the implementation**

Create `lib/os/worker.js`:

```js
import { isQuietHour, pacificDateKey, pacificParts } from './time.js';

export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const BACKUP_HOUR = 3;

export function createWorker({ settings, registry, heartbeat, backup }, { now = () => new Date(), log = console.error } = {}) {
  async function maybeFlushApprovals(date) {
    const { hour } = pacificParts(date);
    if (!settings.get('telegram.bundle_hours').includes(hour)) return 0;
    if (isQuietHour(date, settings.get('telegram.quiet_hours'))) return 0;
    const key = `${pacificDateKey(date)}-${hour}`;
    if (settings.get('telegram.last_bundle') === key) return 0;
    settings.set('telegram.last_bundle', key);
    return registry.flushPendingApprovals();
  }

  async function maybeHeartbeat(date) {
    const last = settings.get('heartbeat.last_ping_at');
    if (last && date.getTime() - Date.parse(last) < HEARTBEAT_INTERVAL_MS) return false;
    settings.set('heartbeat.last_ping_at', date.toISOString());
    return heartbeat.ping(settings.get('os.paused') ? 'paused' : 'ok');
  }

  function maybeBackup(date) {
    const today = pacificDateKey(date);
    if (pacificParts(date).hour < BACKUP_HOUR || settings.get('backup.last_date') === today) return null;
    const file = backup.run();
    settings.set('backup.last_date', today);
    return file;
  }

  async function safely(name, fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      log(`${name} failed: ${error?.message ?? error}`);
      return fallback;
    }
  }

  async function tick() {
    const date = now();
    return {
      executed: await safely('execute', async () => (await registry.executeDue()).executed, 0),
      flushed: await safely('approval bundle', () => maybeFlushApprovals(date), 0),
      heartbeat: await safely('heartbeat', () => maybeHeartbeat(date), false),
      backup: await safely('backup', () => maybeBackup(date), null),
    };
  }

  return { tick, maybeFlushApprovals, maybeHeartbeat, maybeBackup };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osWorker.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/os/worker.js tests/osWorker.test.mjs
git commit -m "feat(os): add worker tick for execution, bundles, heartbeat and backup" -- lib/os/worker.js tests/osWorker.test.mjs
```

---

### Task 17: Runtime, worker process and demo script

**Files:**
- Create: `lib/os/runtime.js`
- Create: `scripts/otg-os-worker.mjs`
- Create: `scripts/otg-os-demo-approval.mjs`
- Test: `tests/osRuntime.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/osRuntime.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOsRuntime } from '../lib/os/runtime.js';

test('runtime works without Telegram or Claude keys', async () => {
  const lines = [];
  const runtime = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:' }, log: (line) => lines.push(line) });
  assert.equal(runtime.bot, null);
  const action = await runtime.registry.request({
    tool: 'system.demo', payload: { draft: 'Hi' }, why: { goal: 'g', expected: 'e' }, idempotencyKey: 'rt1', urgent: true,
  });
  assert.equal(action.status, 'proposed');
  assert.match(lines[0], /approval needed/);
  await assert.rejects(() => runtime.router.run('chat', { messages: [{ role: 'user', content: 'hi' }] }), /anthropic not configured/);
  runtime.close();
});

test('runtime builds the Telegram bot and Claude provider when keys are set', () => {
  const runtime = createOsRuntime({
    env: { OTG_OS_DB_FILE: ':memory:', TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_OWNER_ID: '42', ANTHROPIC_API_KEY: 'sk-test' },
    fetchImpl: async () => ({ json: async () => ({ ok: true, result: [] }) }),
  });
  assert.notEqual(runtime.bot, null);
  runtime.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/osRuntime.test.mjs`
Expected: FAIL with `Cannot find module` for `lib/os/runtime.js`.

- [ ] **Step 3: Write the runtime**

Create `lib/os/runtime.js`:

```js
import path from 'node:path';
import { openOsDb } from './db.js';
import { createSettings } from './settings.js';
import { createLedger } from './ledger.js';
import { createBudget } from './budget.js';
import { createApprovalGate } from './approvalGate.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createModelRouter } from './modelRouter.js';
import { createRegistry } from './registry.js';
import { demoTool } from './tools/demo.js';
import { createTelegramApi } from './telegram/api.js';
import { createConsoleNotifier, createTelegramNotifier } from './telegram/notifier.js';
import { createTelegramBot } from './telegram/bot.js';
import { createChat } from './brain/chat.js';
import { createHeartbeat } from './heartbeat.js';
import { createBackup } from './backup.js';

export function createOsRuntime({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = fetch,
  anthropicClient = null,
  now = () => new Date(),
  log = console.log,
} = {}) {
  const osDb = openOsDb(env.OTG_OS_DB_FILE || path.join(cwd, 'data', 'otg-os.sqlite'));
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb, { now });
  const budget = createBudget(osDb, settings, { now });
  const gate = createApprovalGate(osDb, { now });

  const providers = { ollama: createOllamaProvider({ baseUrl: env.OLLAMA_URL || 'http://localhost:11434', fetchImpl }) };
  if (anthropicClient || env.ANTHROPIC_API_KEY) {
    providers.anthropic = createAnthropicProvider({ client: anthropicClient ?? undefined, apiKey: env.ANTHROPIC_API_KEY });
  }
  const router = createModelRouter({ providers, budget });

  const ownerId = Number(env.TELEGRAM_OWNER_ID) || null;
  const api = env.TELEGRAM_BOT_TOKEN ? createTelegramApi({ token: env.TELEGRAM_BOT_TOKEN, fetchImpl }) : null;
  const notifier = api && ownerId ? createTelegramNotifier({ api, ownerId }) : createConsoleNotifier(log);

  const registry = createRegistry({ ledger, gate, settings, notifier, now });
  registry.register(demoTool);

  const chat = createChat({ router, ledger, budget, gate, settings });
  const bot = api ? createTelegramBot({ api, ownerId, settings, ledger, registry, gate, budget, chat, log }) : null;
  const heartbeat = createHeartbeat({ url: env.HEALTHCHECKS_PING_URL || '', fetchImpl });
  const backup = createBackup({ osDb, dir: env.OTG_OS_BACKUP_DIR || path.join(cwd, 'data', 'backups', 'otg-os'), now });

  return {
    osDb, settings, ledger, budget, gate, router, registry, notifier, chat, bot, heartbeat, backup,
    close: () => osDb.close(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/osRuntime.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the worker process**

Create `scripts/otg-os-worker.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOsRuntime } from '../lib/os/runtime.js';
import { createWorker } from '../lib/os/worker.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const logDir = path.join(projectDir, 'data', 'logs');
fs.mkdirSync(logDir, { recursive: true });

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(logDir, `otg-os-worker-${line.slice(0, 10)}.log`), `${line}\n`);
}

const runtime = createOsRuntime({ log });
const recovered = runtime.ledger.recoverInterrupted();
if (recovered) log(`Recovered ${recovered} interrupted action(s).`);
const worker = createWorker(runtime, { log });

let stopping = false;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tickLoop() {
  while (!stopping) {
    const report = await worker.tick();
    if (report.executed || report.flushed || report.backup) log(`tick ${JSON.stringify(report)}`);
    await sleep(30_000);
  }
}

async function telegramLoop() {
  if (!runtime.bot) {
    log('Telegram is not configured: set TELEGRAM_BOT_TOKEN in .env.local.');
    return;
  }
  if (!Number(process.env.TELEGRAM_OWNER_ID)) log('TELEGRAM_OWNER_ID is missing: send /start to the bot to get your ID.');
  while (!stopping) {
    try {
      await runtime.bot.pollOnce(25);
    } catch (error) {
      log(`Telegram poll failed: ${error.message}`);
      await sleep(5_000);
    }
  }
}

function stop() {
  stopping = true;
  log('Stopping OTG-OS worker...');
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

log('OTG-OS worker started.');
await Promise.all([tickLoop(), telegramLoop()]);
runtime.close();
log('OTG-OS worker stopped.');
```

- [ ] **Step 6: Write the demo script**

Create `scripts/otg-os-demo-approval.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOsRuntime } from '../lib/os/runtime.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(projectDir);
const envFile = path.join(projectDir, '.env.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const runtime = createOsRuntime();
const action = await runtime.registry.request({
  tool: 'system.demo',
  payload: { draft: 'This is a test approval from OTG-OS. Tap Approve, Edit or Reject.' },
  why: {
    goal: 'Verify the Telegram approval loop',
    expected: 'Jack approves in Telegram and the worker marks this action done',
    evidence: ['Plan 1 acceptance check'],
  },
  idempotencyKey: `demo-${Date.now()}`,
  urgent: true,
});
console.log(`Created ${action.id} (${action.status}). Check Telegram.`);
runtime.close();
```

- [ ] **Step 7: Smoke-test the worker without Telegram**

Run (it should start, log twice, then you stop it with Ctrl+C after about 5 seconds):

```bash
OTG_OS_DB_FILE=data/otg-os-smoke.sqlite TELEGRAM_BOT_TOKEN= node scripts/otg-os-worker.mjs
```

Expected output includes `OTG-OS worker started.` and `Telegram is not configured`. After Ctrl+C: `OTG-OS worker stopped.` within 30 seconds. Then delete the smoke database: `rm -f data/otg-os-smoke.sqlite*`.

- [ ] **Step 8: Commit**

```bash
git add lib/os/runtime.js scripts/otg-os-worker.mjs scripts/otg-os-demo-approval.mjs tests/osRuntime.test.mjs
git commit -m "feat(os): add runtime, worker process and demo approval script" -- lib/os/runtime.js scripts/otg-os-worker.mjs scripts/otg-os-demo-approval.mjs tests/osRuntime.test.mjs
```

---

### Task 18: Startup tasks, legacy auto-jobs off, and docs

**Files:**
- Create: `scripts/install-otg-os-tasks.ps1`
- Modify: `README.md` (add an OTG-OS section after "## Product North Star")
- Modify: `CLAUDE.md` (environment variable list)

- [ ] **Step 1: Write the startup task installer**

Create `scripts/install-otg-os-tasks.ps1`. It registers both processes to start at boot without anyone logged in (S4U logon, no stored password) and restart every minute on failure.

```powershell
#Requires -RunAsAdministrator
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [switch]$Uninstall
)

$taskNames = @('OTG-OS Worker', 'OTG-OS Web')

if ($Uninstall) {
  foreach ($name in $taskNames) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  }
  Write-Host 'Removed OTG-OS startup tasks.'
  return
}

$node = (Get-Command node).Source
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries
$trigger = New-ScheduledTaskTrigger -AtStartup

$workerAction = New-ScheduledTaskAction -Execute $node -Argument 'scripts\otg-os-worker.mjs' -WorkingDirectory $ProjectDir
Register-ScheduledTask -TaskName 'OTG-OS Worker' -Action $workerAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

$webAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File scripts\start-agent-os.ps1 -SkipBuild' `
  -WorkingDirectory $ProjectDir
Register-ScheduledTask -TaskName 'OTG-OS Web' -Action $webAction -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Registered 'OTG-OS Worker' and 'OTG-OS Web' to start at boot from $ProjectDir."
Write-Host "Start them now with: Start-ScheduledTask -TaskName 'OTG-OS Worker'; Start-ScheduledTask -TaskName 'OTG-OS Web'"
```

- [ ] **Step 2: Turn off the legacy timed auto-jobs**

The spec replaces them with the goal-driven planner. Run:

```bash
node -e "import('./lib/autojobs.js').then((m) => console.log(m.updateAutoJobSettings({ mode: 'manual' })))"
```

Expected: `{ mode: 'manual' }`

- [ ] **Step 3: Document OTG-OS in the README**

In `README.md`, insert this section directly after the `## Product North Star` section (before `## Agents`):

```markdown
## OTG-OS Core
- OTG-OS is the always-on operating layer for OFF THE GROUND: an action ledger that records why every action happens, earned autonomy (Ask, Tell, Silent), budget caps, a model router, and a Telegram bot for approvals.
- Code lives in `lib/os/`; the database is `data/otg-os.sqlite`.
- Run the worker in a terminal with `npm run os:worker`. Create a test approval with `npm run os:demo`.
- To start everything at boot, run `scripts/install-otg-os-tasks.ps1` once from an administrator PowerShell.
- Required in `.env.local`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID` (send `/start` to the bot to get it), `ANTHROPIC_API_KEY`. Optional: `HEALTHCHECKS_PING_URL`, `OTG_OS_BACKUP_DIR` (point it at a Google Drive or OneDrive folder for off-machine backups).
- Design: `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md`. Plans: `docs/superpowers/plans/`.
```

- [ ] **Step 4: Update the environment list in CLAUDE.md**

In `CLAUDE.md`, inside the "Not yet configured" code block, add these lines after the `ENSEMBLEDATA_TOKEN` line:

```
ANTHROPIC_API_KEY                 # OTG-OS brain (Claude Sonnet/Haiku/Opus)
TELEGRAM_BOT_TOKEN                # OTG-OS Telegram bot (from BotFather)
TELEGRAM_OWNER_ID                 # the only Telegram user the bot obeys
HEALTHCHECKS_PING_URL             # outside heartbeat for the OTG-OS worker
OTG_OS_BACKUP_DIR                 # daily database backups (use a cloud-synced folder)
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: `ℹ pass 115` and `ℹ fail 0` (the original 31 tests plus 84 new OTG-OS tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/install-otg-os-tasks.ps1 README.md CLAUDE.md
git commit -m "feat(os): add startup task installer and OTG-OS docs" -- scripts/install-otg-os-tasks.ps1 README.md CLAUDE.md
```

---

### Task 19: Live verification with the owner

This task needs the owner's own accounts, so it is done together with the owner. Do not enter tokens or keys on the owner's behalf in any website; the owner creates them and pastes them into `.env.local`.

- [ ] **Step 1: Owner creates the Telegram bot**

The owner opens Telegram, messages `@BotFather`, sends `/newbot`, names it (for example "OTG-OS"), and adds the token to `.env.local` as `TELEGRAM_BOT_TOKEN=...`. The owner also adds `ANTHROPIC_API_KEY=...`.

- [ ] **Step 2: Get the owner's Telegram ID**

Run `npm run os:worker` in a terminal. The owner sends `/start` to the bot. Expected: the bot replies `Your Telegram user ID is <number>...`. The owner adds `TELEGRAM_OWNER_ID=<number>` to `.env.local`. Stop the worker (Ctrl+C) and start it again.

- [ ] **Step 3: Prove the approval loop**

In a second terminal run `npm run os:demo`. Expected in Telegram within seconds: a "🟡 Approval needed · system.demo" message with Approve / Edit / Reject buttons. The owner taps **Approve**. Within one minute, check:

```bash
node -e "import('./lib/os/runtime.js').then(({ createOsRuntime }) => { const r = createOsRuntime(); console.log(r.ledger.list({ limit: 1 })[0].status); r.close(); })"
```

Expected: `done`.

- [ ] **Step 4: Prove edit, reject and commands**

Run `npm run os:demo` twice more. On the first, tap **Edit**, send new text, then approve the re-sent version. On the second, tap **Reject** and pick a reason. Then send `/status`, `/budget`, `/pause` (confirm `/status` says paused), `/resume`, and a plain question such as "how much have we spent this month?". Expected: each reply arrives, the question is answered by Claude using the budget tool, and `/budget` shows a small non-zero spend.

- [ ] **Step 5: Install the startup tasks**

The owner opens PowerShell **as Administrator**, runs `cd C:\AI-Agents\agent-os; .\scripts\install-otg-os-tasks.ps1`, and stops any worker running in a terminal. Then start the tasks: `Start-ScheduledTask -TaskName 'OTG-OS Worker'; Start-ScheduledTask -TaskName 'OTG-OS Web'`. Expected: `/status` in Telegram answers, and `http://localhost:4000` loads.

- [ ] **Step 6: Restart test**

Restart the PC. Without logging in, wait two minutes, then send `/status` from the phone. Expected: the bot answers. Check `data/logs/otg-os-worker-<date>.log` for `OTG-OS worker started.`

- [ ] **Step 7: Optional heartbeat and backups**

The owner creates a free check at healthchecks.io with a 5-minute period and 10-minute grace, connects its Telegram or email alert, and adds `HEALTHCHECKS_PING_URL=...` to `.env.local`. For off-machine backups, set `OTG_OS_BACKUP_DIR` to a folder inside Google Drive for desktop or OneDrive. Restart the worker task. Expected: the check turns green within 5 minutes, and a `otg-os-*.sqlite` file appears in the backup folder after 3am Pacific (or immediately if the worker starts after 3am and none exists for today).

- [ ] **Step 8: Windows Update active hours**

The owner sets Settings → Windows Update → Advanced options → Active hours to cover the working day so restarts happen overnight. The startup tasks bring OTG-OS back after any restart.
