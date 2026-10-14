import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiChatProvider } from '../lib/os/providers/openaiChat.js';

function fakeFetch(reply, requests = []) {
  return async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply) };
  };
}

const textReply = {
  model: 'deepseek-flash',
  choices: [{ message: { role: 'assistant', content: 'Summary ready.' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_cache_hit_tokens: 400 },
};

test('sends an OpenAI-style request with auth, system prompt and extra body fields', async () => {
  const requests = [];
  const provider = createOpenAiChatProvider({
    name: 'deepseek', baseUrl: 'https://api.deepseek.test', apiKey: 'sk-test',
    fetchImpl: fakeFetch(textReply, requests), extraBody: { thinking: { type: 'disabled' } },
  });
  const result = await provider.complete({ model: 'deepseek-flash', system: 'Be brief', messages: [{ role: 'user', content: 'Summarize' }], maxTokens: 500 });
  assert.equal(requests[0].url, 'https://api.deepseek.test/chat/completions');
  assert.equal(requests[0].headers.Authorization, 'Bearer sk-test');
  assert.deepEqual(requests[0].body.messages, [{ role: 'system', content: 'Be brief' }, { role: 'user', content: 'Summarize' }]);
  assert.equal(requests[0].body.max_tokens, 500);
  assert.deepEqual(requests[0].body.thinking, { type: 'disabled' });
  assert.equal(result.text, 'Summary ready.');
  assert.equal(result.stopReason, 'end_turn');
  assert.deepEqual(result.usage, { inputTokens: 600, outputTokens: 50, cacheReadTokens: 400, cacheWriteTokens: 0 });
});

test('turns tool calls into tool_use blocks and tool history into OpenAI messages', async () => {
  const requests = [];
  const reply = {
    model: 'deepseek-flash',
    choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_budget_status', arguments: '{}' } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
  const provider = createOpenAiChatProvider({ name: 'deepseek', baseUrl: 'https://api.deepseek.test', apiKey: 'k', fetchImpl: fakeFetch(reply, requests) });
  const tools = [{ name: 'get_budget_status', description: 'Spend', strict: true, input_schema: { type: 'object', properties: {}, additionalProperties: false } }];
  const result = await provider.complete({
    model: 'deepseek-flash',
    tools,
    messages: [
      { role: 'user', content: 'Spend?' },
      { role: 'assistant', content: [{ type: 'text', text: 'Checking.' }, { type: 'tool_use', id: 'toolu_9', name: 'list_recent_actions', input: { limit: 2 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: '[]' }] },
    ],
  });
  assert.equal(result.stopReason, 'tool_use');
  assert.deepEqual(result.content, [{ type: 'tool_use', id: 'call_1', name: 'get_budget_status', input: {} }]);
  assert.deepEqual(requests[0].body.tools, [{ type: 'function', function: { name: 'get_budget_status', description: 'Spend', parameters: tools[0].input_schema } }]);
  assert.deepEqual(requests[0].body.messages.slice(1), [
    { role: 'assistant', content: 'Checking.', tool_calls: [{ id: 'toolu_9', type: 'function', function: { name: 'list_recent_actions', arguments: '{"limit":2}' } }] },
    { role: 'tool', tool_call_id: 'toolu_9', content: '[]' },
  ]);
});

test('raises on HTTP errors with the response body and on empty answers', async () => {
  const failing = createOpenAiChatProvider({
    name: 'deepseek', baseUrl: 'https://api.deepseek.test', apiKey: 'k',
    fetchImpl: async () => ({ ok: false, status: 402, text: async () => '{"error":"Insufficient Balance"}' }),
  });
  await assert.rejects(() => failing.complete({ model: 'deepseek-flash', messages: [{ role: 'user', content: 'x' }] }), /deepseek error 402.*Insufficient Balance/);
  const empty = createOpenAiChatProvider({
    name: 'deepseek', baseUrl: 'https://api.deepseek.test', apiKey: 'k',
    fetchImpl: fakeFetch({ choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: {} }),
  });
  await assert.rejects(() => empty.complete({ model: 'deepseek-flash', messages: [{ role: 'user', content: 'x' }] }), /empty response/);
});
