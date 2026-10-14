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
