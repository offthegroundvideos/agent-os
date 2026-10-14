import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { CHAT_TOOLS, SEARCH_TOOL, createChat } from '../lib/os/brain/chat.js';

function setup(responses, { liveSearch } = {}) {
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
  return { osDb, ledger, router, chat: createChat({ router, ledger, budget, gate, settings, liveSearch }) };
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

test('pending approvals are visible to chat', async () => {
  const { osDb, ledger, chat } = setup([]);
  ledger.propose({ idempotencyKey: 'k1', actionType: 'system.demo', tool: 'system.demo', payload: { draft: 'Hi' }, why: { goal: 'Test', expected: 'Approve' }, autonomyLevel: 'ask' });
  const pending = await chat.runTool('list_pending_approvals', {});
  assert.equal(pending.length, 1);
  assert.equal(pending[0].goal, 'Test');
  assert.equal((await chat.runTool('list_recent_actions', { limit: 500 })).length, 1);
  assert.deepEqual(await chat.runTool('nope', {}), { error: 'Unknown tool nope' });
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

test('live search is offered only when configured, and runs through the search wrapper', async () => {
  const searches = [];
  const liveSearch = { async search(input) { searches.push(input); return { answer: 'Resort A posted villa reels.', links: ['https://x.com/a/status/1'] }; } };
  const without = setup([{ stopReason: 'end_turn', text: 'ok', content: [] }]);
  await without.chat.ask('hi');
  assert.ok(!without.router.calls[0].request.tools.some((tool) => tool.name === 'search_live'));
  assert.deepEqual(await without.chat.runTool('search_live', { query: 'x', sources: 'x' }), { error: 'Live search is not configured (set XAI_API_KEY).' });
  without.osDb.close();

  const withSearch = setup([
    { stopReason: 'tool_use', text: '', content: [{ type: 'tool_use', id: 'tu_s', name: 'search_live', input: { query: 'Bora Bora resorts on X', sources: 'x' } }] },
    { stopReason: 'end_turn', text: 'Resort A posted villa reels.', content: [{ type: 'text', text: 'Resort A posted villa reels.' }] },
  ], { liveSearch });
  const answer = await withSearch.chat.ask('What are Bora Bora resorts posting on X?');
  assert.equal(answer, 'Resort A posted villa reels.');
  assert.ok(withSearch.router.calls[0].request.tools.some((tool) => tool.name === 'search_live'));
  assert.deepEqual(searches, [{ query: 'Bora Bora resorts on X', sources: 'x' }]);
  withSearch.osDb.close();
});

test('the live search tool schema is strict and limits sources', () => {
  assert.equal(SEARCH_TOOL.strict, true);
  assert.equal(SEARCH_TOOL.input_schema.additionalProperties, false);
  assert.deepEqual(SEARCH_TOOL.input_schema.properties.sources.enum, ['x', 'web', 'both']);
});
