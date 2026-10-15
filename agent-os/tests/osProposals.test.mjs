import test from 'node:test';
import assert from 'node:assert/strict';
import { createOsRuntime } from '../lib/os/runtime.js';
import { PROPOSAL_TOOLS, createChat } from '../lib/os/brain/chat.js';

function setup(responses = []) {
  const runtime = createOsRuntime({ env: { OTG_OS_DB_FILE: ':memory:' }, log: () => {} });
  const router = {
    calls: [],
    async run(taskType, request) {
      this.calls.push({ taskType, request: structuredClone(request) });
      return responses.shift();
    },
  };
  const { ledger, budget, gate, settings, dashboard, settingsEditor } = runtime;
  return { runtime, router, chat: createChat({ router, ledger, budget, gate, settings, dashboard, settingsEditor }) };
}

const why = { goal: 'Book shoots', expected: 'A reply' };
const pitch = (runtime, business, key) => runtime.registry.request({
  tool: 'system.demo', payload: { draft: `Hi ${business}`, business, subject: `Film for ${business}` }, why, idempotencyKey: key,
});
const toolCall = (name, input, id = 't1') => ({ stopReason: 'tool_use', text: '', content: [{ type: 'tool_use', id, name, input }] });
const done = (text) => ({ stopReason: 'end_turn', text, content: [] });

test('proposal tools are strict and offered only in the dashboard console', async () => {
  for (const tool of PROPOSAL_TOOLS) {
    assert.equal(tool.strict, true);
    assert.deepEqual([...tool.input_schema.required].sort(), Object.keys(tool.input_schema.properties).sort());
  }
  const { runtime, router, chat } = setup([done('ok'), done('ok')]);
  await chat.ask('hi');
  await chat.converse('hi', { channel: 'dashboard' });
  const names = (call) => call.request.tools.map((tool) => tool.name);
  assert.ok(!names(router.calls[0]).includes('propose_decision'), 'Telegram has its own buttons');
  assert.ok(names(router.calls[1]).includes('propose_decision'));
  assert.ok(names(router.calls[1]).includes('propose_control'));
  runtime.close();
});

test('approving by name proposes it, and nothing changes until Jack confirms', async () => {
  const { runtime, chat } = setup([
    toolCall('propose_decision', { target: 'duckhorn', decision: 'approve', reason: 'none' }),
    done('The Duckhorn pitch is ready to confirm.'),
  ]);
  const action = await pitch(runtime, 'Duckhorn Vineyards', 'p1');
  await pitch(runtime, 'Silver Oak', 'p2');
  const result = await chat.converse('approve the duckhorn one', { channel: 'dashboard' });
  assert.equal(result.answer, 'The Duckhorn pitch is ready to confirm.');
  assert.deepEqual(result.proposals, [{
    kind: 'decision', actionId: action.id, decision: 'approve', reason: null,
    actionType: 'system.demo', business: 'Duckhorn Vineyards', subject: 'Film for Duckhorn Vineyards',
  }]);
  assert.equal(runtime.ledger.get(action.id).status, 'proposed', 'the brain never approves');
  runtime.close();
});

test('rejections carry a valid reason; unknown, ambiguous and missing targets are explained', async () => {
  const { runtime, chat } = setup();
  await pitch(runtime, 'Silver Oak', 'p1');
  await pitch(runtime, 'Silver Lake Weddings', 'p2');
  const proposals = [];
  assert.match((await chat.runTool('propose_decision', { target: 'nope', decision: 'approve', reason: 'none' }, { proposals })).error, /Nothing waiting matches/);
  const ambiguous = await chat.runTool('propose_decision', { target: 'silver', decision: 'reject', reason: 'wrong_tone' }, { proposals });
  assert.equal(ambiguous.matches.length, 2);
  await chat.runTool('propose_decision', { target: 'silver oak', decision: 'reject', reason: 'wrong_tone' }, { proposals });
  await chat.runTool('propose_decision', { target: 'silver oak', decision: 'reject', reason: 'wrong_tone' }, { proposals });
  assert.equal(proposals.length, 1, 'the same proposal is not repeated');
  assert.equal(proposals[0].reason, 'wrong_tone');
  runtime.close();
});

test('pause and resume proposals need a real lane for lane ops', async () => {
  const { runtime, chat } = setup();
  const proposals = [];
  assert.match((await chat.runTool('propose_control', { op: 'pause_lane', lane: 'none' }, { proposals })).error, /Pick a lane/);
  await chat.runTool('propose_control', { op: 'pause_lane', lane: 'winery' }, { proposals });
  await chat.runTool('propose_control', { op: 'pause_all', lane: 'winery' }, { proposals });
  assert.deepEqual(proposals, [{ kind: 'control', op: 'pause_lane', lane: 'winery' }, { kind: 'control', op: 'pause_all', lane: null }]);
  assert.equal(runtime.settings.get('os.paused'), false);
  assert.deepEqual(runtime.settings.get('outreach.paused_lanes'), {});
  runtime.close();
});

test('outside the dashboard the proposal tools do nothing', async () => {
  const { runtime, chat } = setup();
  assert.match((await chat.runTool('propose_control', { op: 'pause_all', lane: 'none' })).error, /Unknown tool/);
  runtime.close();
});
