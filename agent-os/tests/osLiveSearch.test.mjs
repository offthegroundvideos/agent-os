import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createBudget } from '../lib/os/budget.js';
import { createXaiSearch } from '../lib/os/providers/xaiSearch.js';
import { createLiveSearch } from '../lib/os/tools/liveSearch.js';

const responsesReply = {
  model: 'grok-4.3',
  output: [
    { type: 'x_search_call', status: 'completed' },
    {
      type: 'message',
      content: [{
        type: 'output_text',
        text: 'Two Bora Bora resorts posted new villa reels this week.',
        annotations: [
          { type: 'url_citation', url: 'https://x.com/resortA/status/1' },
          { type: 'url_citation', url: 'https://example.com/news' },
        ],
      }],
    },
  ],
  citations: ['https://x.com/resortA/status/1', 'https://x.com/resortB/status/2'],
  usage: { input_tokens: 2000, output_tokens: 300, num_sources_used: 3 },
};

function fakeFetch(reply, requests = [], ok = true) {
  return async (url, init) => {
    requests.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok, status: ok ? 200 : 429, json: async () => reply, text: async () => JSON.stringify(reply) };
  };
}

test('xai search calls the Responses API with the requested search tools', async () => {
  const requests = [];
  const xai = createXaiSearch({ apiKey: 'xai-test', fetchImpl: fakeFetch(responsesReply, requests) });
  const result = await xai.search({ query: 'Bora Bora resorts', sources: ['x', 'web'] });
  assert.equal(requests[0].url, 'https://api.x.ai/v1/responses');
  assert.equal(requests[0].headers.Authorization, 'Bearer xai-test');
  assert.equal(requests[0].body.model, 'grok-4.3');
  assert.deepEqual(requests[0].body.tools, [{ type: 'x_search' }, { type: 'web_search' }]);
  assert.equal(result.text, 'Two Bora Bora resorts posted new villa reels this week.');
  assert.deepEqual(result.citations, ['https://x.com/resortA/status/1', 'https://example.com/news', 'https://x.com/resortB/status/2']);
  assert.deepEqual(result.usage, { inputTokens: 2000, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 });
  assert.equal(result.sourcesUsed, 3);
});

test('xai search raises on HTTP errors', async () => {
  const xai = createXaiSearch({ apiKey: 'k', fetchImpl: fakeFetch({ error: 'rate limited' }, [], false) });
  await assert.rejects(() => xai.search({ query: 'x' }), /xAI search error 429/);
});

function setup(xai) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const budget = createBudget(osDb, settings);
  return { osDb, budget, live: createLiveSearch({ xai, budget, settings }) };
}

test('live search records token and per-source cost against the budget', async () => {
  const { osDb, budget, live } = setup(createXaiSearch({ apiKey: 'k', fetchImpl: fakeFetch(responsesReply) }));
  const result = await live.search({ query: 'Bora Bora resorts', sources: 'both' });
  assert.equal(result.answer, 'Two Bora Bora resorts posted new villa reels this week.');
  assert.equal(result.links.length, 3);
  const [row] = osDb.db.prepare('SELECT * FROM spend').all();
  assert.equal(row.provider, 'xai');
  assert.equal(row.task_type, 'search');
  assert.equal(row.units, 3);
  assert.equal(row.cost_micros, 2000 * 1.25 + 300 * 2.5 + 3 * 10_000);
  assert.equal(budget.monthToDateMicros(), row.cost_micros);
  osDb.close();
});

test('live search refuses when the budget is capped and when sources are invalid', async () => {
  const requests = [];
  const { osDb, budget, live } = setup(createXaiSearch({ apiKey: 'k', fetchImpl: fakeFetch(responsesReply, requests) }));
  assert.deepEqual(await live.search({ query: 'x', sources: 'tiktok' }), { error: 'sources must be x, web or both' });
  budget.record({ provider: 'anthropic', modelOrTool: 'claude-sonnet-5-5', taskType: 'chat', costMicros: 150_000_000 });
  assert.deepEqual(await live.search({ query: 'x', sources: 'x' }), { error: 'Monthly AI budget cap reached; live search is paused.' });
  assert.equal(requests.length, 0);
  osDb.close();
});
