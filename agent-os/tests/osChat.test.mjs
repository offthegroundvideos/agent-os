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
