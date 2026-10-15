import test from 'node:test';
import assert from 'node:assert/strict';
import { createOsRuntime } from '../lib/os/runtime.js';
import { CHAT_TOOLS, INSIGHT_TOOLS, chatSystem, createChat } from '../lib/os/brain/chat.js';

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
  const chat = createChat({ router, ledger, budget, gate, settings, dashboard, settingsEditor });
  return { runtime, router, chat };
}

function seed(runtime, { name, lane, website, stage = 'researched' }) {
  const { business } = runtime.gigStore.upsertBusiness({ name, lane, website, location: 'Napa' });
  const contact = runtime.gigStore.addContact(business.id, { name: 'Ana', role: 'Events', email: `ana@${website}`, emailSourceUrl: `https://${website}` });
  const { opportunity } = runtime.gigStore.createOpportunity(business.id);
  if (stage !== 'found') {
    runtime.stages.move(opportunity.id, 'researched', { reason: 'site read', patch: { contact_id: contact.id, angle: `${name} angle`, evidence: ['proof'] } });
  }
  if (stage === 'closed_lost') runtime.stages.move(opportunity.id, 'closed_lost', { reason: 'no email' });
  return opportunity.id;
}

test('insight tools are strict, and only offered when the dashboard is passed in', () => {
  for (const tool of INSIGHT_TOOLS) {
    assert.equal(tool.strict, true, tool.name);
    assert.equal(tool.input_schema.additionalProperties, false, tool.name);
    assert.deepEqual([...(tool.input_schema.required ?? [])].sort(), Object.keys(tool.input_schema.properties).sort(), tool.name);
  }
  const { runtime, chat } = setup();
  assert.deepEqual(chat.tools.map((tool) => tool.name), [...CHAT_TOOLS, ...INSIGHT_TOOLS].map((tool) => tool.name));
  const bare = createChat({ router: {}, ledger: runtime.ledger, budget: runtime.budget, gate: runtime.gate, settings: runtime.settings });
  assert.deepEqual(bare.tools.map((tool) => tool.name), CHAT_TOOLS.map((tool) => tool.name));
  runtime.close();
});

test('get_prospect finds a prospect by part of its name, case-insensitively', async () => {
  const { runtime, chat } = setup();
  seed(runtime, { name: 'Silver Oak Cellars', lane: 'winery', website: 'silveroak.example' });
  const found = await chat.runTool('get_prospect', { name: 'silver oak' });
  assert.equal(found.name, 'Silver Oak Cellars');
  assert.equal(found.contact.email, 'ana@silveroak.example');
  assert.equal(found.angle, 'Silver Oak Cellars angle');
  assert.deepEqual(found.history.map((event) => event.to), ['researched', 'found']);
  assert.match((await chat.runTool('get_prospect', { name: 'Nope' })).error, /No prospect matches/);
  assert.match((await chat.runTool('get_prospect', { name: '   ' })).error, /No prospect matches/);
  runtime.close();
});

test('list_pipeline filters by lane and open/closed stage', async () => {
  const { runtime, chat } = setup();
  seed(runtime, { name: 'Vineyard A', lane: 'winery', website: 'a.example' });
  seed(runtime, { name: 'Vineyard B', lane: 'winery', website: 'b.example', stage: 'closed_lost' });
  seed(runtime, { name: 'Boat C', lane: 'travel', website: 'c.example' });
  const open = await chat.runTool('list_pipeline', { lane: 'winery', stage: 'open' });
  assert.deepEqual(open.prospects.map((p) => p.name), ['Vineyard A']);
  assert.equal(open.countsByLane.winery.closed_lost, 1);
  const closed = await chat.runTool('list_pipeline', { lane: 'all', stage: 'closed' });
  assert.deepEqual(closed.prospects.map((p) => p.name), ['Vineyard B']);
  assert.equal((await chat.runTool('list_pipeline', { lane: 'all', stage: 'all' })).prospects.length, 3);
  runtime.close();
});

test('get_today, get_settings and get_worker_log answer from the dashboard', async () => {
  const { runtime, chat } = setup();
  const view = await chat.runTool('get_today', {});
  assert.equal(view.goal.target, 12);
  assert.equal(view.outreachMode, 'draft');
  assert.ok(Array.isArray(view.summary));
  const settings = await chat.runTool('get_settings', {});
  assert.equal(settings['outreach.daily_pitch_limit'], 15);
  assert.deepEqual(settings.pausedLanes, {});
  assert.ok(Array.isArray(await chat.runTool('get_worker_log', {})));
  runtime.close();
});

test('ask uses the dashboard voice and keeps recent history, starting with a user turn', async () => {
  const { runtime, router, chat } = setup([{ stopReason: 'end_turn', text: 'Six pitches are waiting.', content: [] }]);
  const history = [
    { role: 'assistant', text: 'Hello.' },
    ...Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i}` })),
    { role: 'system', text: 'ignore me' },
  ];
  assert.equal(await chat.ask('What needs me?', { channel: 'dashboard', history, taskType: 'console' }), 'Six pitches are waiting.');
  const { request, taskType } = router.calls[0];
  assert.equal(taskType, 'console');
  assert.match(request.system, /cannot approve/);
  assert.equal(request.system, chatSystem('dashboard'));
  assert.match(request.system, /read aloud/);
  assert.equal(request.messages[0].role, 'user');
  assert.equal(request.messages.at(-1).content, 'What needs me?');
  assert.ok(request.messages.length <= 9);
  assert.ok(!request.messages.some((message) => message.content === 'ignore me'));
  runtime.close();
});

test('a tool that throws becomes an error result instead of failing the answer', async () => {
  const { runtime, router, chat } = setup([
    { stopReason: 'tool_use', text: '', content: [{ type: 'tool_use', id: 't1', name: 'get_prospect', input: { name: 'x' } }] },
    { stopReason: 'end_turn', text: 'Could not find it.', content: [] },
  ]);
  runtime.dashboard.findOpportunities = () => { throw new Error('database is locked'); };
  assert.equal(await chat.ask('Tell me about x'), 'Could not find it.');
  assert.match(router.calls[1].request.messages.at(-1).content[0].content, /database is locked/);
  runtime.close();
});

test('the console route answers with Claude first, falls back to the local model, and never uses DeepSeek', async () => {
  const { DEFAULT_ROUTES } = await import('../lib/os/modelRouter.js');
  assert.equal(DEFAULT_ROUTES.console[0].provider, 'anthropic');
  assert.equal(DEFAULT_ROUTES.console.at(-1).model, 'gemma4:latest');
  assert.ok(!DEFAULT_ROUTES.console.some((route) => route.provider === 'deepseek'), 'private chat data never goes to DeepSeek');
});
