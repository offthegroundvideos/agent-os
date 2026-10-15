import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { BRIEF_PROMPT, createMorningBrief } from '../lib/os/morningBrief.js';
import { createWorker } from '../lib/os/worker.js';
import { createOsRuntime } from '../lib/os/runtime.js';

function setup(answer = 'Six drafts wait. First: clear Approvals.') {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const asked = [];
  const chat = { async converse(question, options) { asked.push({ question, options }); if (answer instanceof Error) throw answer; return { answer, proposals: [] }; } };
  return { osDb, settings, asked, chat };
}

test('the brief is due once a day from 7am Pacific and is kept for the dashboard', async () => {
  const ctx = setup();
  const brief = createMorningBrief({ chat: ctx.chat, settings: ctx.settings });
  assert.equal(brief.isDue(new Date('2026-10-15T13:30:00Z')), false, '6:30am Pacific is too early');
  const seven = new Date('2026-10-15T14:05:00Z');
  assert.equal(brief.isDue(seven), true);
  const written = await brief.write(seven);
  assert.deepEqual(written, { date: '2026-10-15', at: seven.toISOString(), text: 'Six drafts wait. First: clear Approvals.' });
  assert.deepEqual(brief.latest(), written);
  assert.equal(brief.isDue(new Date('2026-10-15T20:00:00Z')), false, 'once per day');
  assert.equal(brief.isDue(new Date('2026-10-16T14:05:00Z')), true);
  assert.equal(ctx.asked[0].question, BRIEF_PROMPT);
  assert.equal(ctx.asked[0].options.taskType, 'console');
  ctx.osDb.close();
});

test('a failed brief does not retry every tick', async () => {
  const ctx = setup(new Error('model down'));
  const brief = createMorningBrief({ chat: ctx.chat, settings: ctx.settings });
  const seven = new Date('2026-10-15T14:05:00Z');
  await assert.rejects(() => brief.write(seven), /model down/);
  assert.equal(brief.isDue(seven), false);
  ctx.osDb.close();
});

test('the worker sends the brief to Telegram once at 7am', async () => {
  const ctx = setup();
  let at = new Date('2026-10-15T14:05:00Z');
  const sent = [];
  const brief = createMorningBrief({ chat: ctx.chat, settings: ctx.settings });
  const worker = createWorker({
    settings: ctx.settings, registry: { executeDue: async () => ({ executed: 0 }), flushPendingApprovals: async () => 0 },
    heartbeat: { ping: async () => true }, backup: { run: () => null }, brief, notifier: { async report(text) { sent.push(text); } },
  }, { now: () => at, log: () => {} });
  assert.equal(await worker.maybeMorningBrief(at), true);
  assert.equal(await worker.maybeMorningBrief(at), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^☀️ Morning brief\n\nSix drafts wait/);
  ctx.osDb.close();
});

test('pulse counts waiting drafts, hot leads and failures', async () => {
  const runtime = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:' }, log: () => {} });
  assert.deepEqual({ ...runtime.dashboard.pulse() }, { waiting: 0, hot: 0, failed: 0 });
  await runtime.registry.request({ tool: 'system.demo', payload: { draft: 'x' }, why: { goal: 'g', expected: 'e' }, idempotencyKey: 'k' });
  assert.equal(runtime.dashboard.pulse().waiting, 1);
  assert.equal(typeof runtime.brief.isDue, 'function');
  runtime.close();
});
