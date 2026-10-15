import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createLedger } from '../lib/os/ledger.js';
import { createRedrafter, REDRAFT_SYSTEM } from '../lib/os/redraft.js';
import { RouterError } from '../lib/os/modelRouter.js';
import { errorResponse } from '../lib/os/web.js';

function setup(reply) {
  const osDb = openOsDb(':memory:');
  const ledger = createLedger(osDb);
  const router = {
    calls: [],
    async run(taskType, request, options) {
      this.calls.push({ taskType, request, options });
      if (reply instanceof Error) throw reply;
      return { text: reply, model: 'claude-sonnet-5-5', needsReview: false };
    },
  };
  const { action } = ledger.propose({
    idempotencyKey: 'p1', actionType: 'email.first_contact', tool: 'email.pitch', autonomyLevel: 'ask',
    payload: { business: 'Silver Oak', to: 'ana@silveroak.example', subject: 'Harvest film', draft: 'Hi Ana,\n\nLong pitch here.' },
    why: { goal: 'Book winery shoots', expected: 'A reply' },
  });
  return { osDb, ledger, router, action, redrafter: createRedrafter({ router, ledger }) };
}

test('redraft sends the draft and the instruction through the draft route and returns the new body', async () => {
  const ctx = setup(JSON.stringify({ body: 'Hi Ana,\n\nShort pitch.' }));
  const result = await ctx.redrafter.redraft(ctx.action.id, 'shorter');
  assert.deepEqual(result, { draft: 'Hi Ana,\n\nShort pitch.', needsReview: false, model: 'claude-sonnet-5-5' });
  const [call] = ctx.router.calls;
  assert.equal(call.taskType, 'draft');
  assert.equal(call.request.system, REDRAFT_SYSTEM);
  assert.match(call.request.messages[0].content, /<draft>\nHi Ana,\n\nLong pitch here.\n<\/draft>/);
  assert.match(call.request.messages[0].content, /<instruction>shorter<\/instruction>/);
  assert.match(call.request.messages[0].content, /Subject \(stays the same\): Harvest film/);
  assert.equal(call.options.actionId, ctx.action.id, 'the cost is booked against the action');
  assert.equal(ctx.ledger.get(ctx.action.id).payload.draft, 'Hi Ana,\n\nLong pitch here.', 'nothing is saved');
  ctx.osDb.close();
});

test('redraft refuses empty or long instructions, handled actions and empty replies', async () => {
  const ctx = setup('not json at all');
  await assert.rejects(() => ctx.redrafter.redraft(ctx.action.id, '  '), /Say what to change/);
  await assert.rejects(() => ctx.redrafter.redraft(ctx.action.id, 'x'.repeat(501)), /under 500/);
  await assert.rejects(() => ctx.redrafter.redraft(ctx.action.id, 'warmer'), /came back empty/);
  ctx.ledger.reject(ctx.action.id);
  await assert.rejects(() => ctx.redrafter.redraft(ctx.action.id, 'warmer'), /no longer waiting/);
  await assert.rejects(() => ctx.redrafter.redraft('act_missing', 'warmer'), /no longer waiting/);
  ctx.osDb.close();
});

test('a model outage surfaces as 503', async () => {
  const ctx = setup(new RouterError('draft', ['anthropic down']));
  let caught;
  try {
    await ctx.redrafter.redraft(ctx.action.id, 'warmer');
  } catch (error) {
    caught = error;
  }
  assert.equal(errorResponse(caught).status, 503);
  ctx.osDb.close();
});
