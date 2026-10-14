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
