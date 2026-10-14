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
  await assert.rejects(() => runtime.router.run('decision', { messages: [{ role: 'user', content: 'hi' }] }), /anthropic not configured/);
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

test('DeepSeek and Grok live search switch on only when their keys are set', () => {
  const off = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:' }, log: () => {} });
  assert.equal(off.providers.deepseek, undefined);
  assert.equal(off.liveSearch, null);
  off.close();
  const on = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:', DEEPSEEK_API_KEY: 'ds', XAI_API_KEY: 'xai' }, log: () => {} });
  assert.equal(on.providers.deepseek.name, 'deepseek');
  assert.notEqual(on.liveSearch, null);
  on.close();
});
