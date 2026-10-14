// tests/osGigStages.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { canMove, createStages } from '../lib/os/gigs/stages.js';

function setup() {
  const osDb = openOsDb(':memory:');
  const store = createGigStore(osDb);
  const stages = createStages(osDb);
  const { business } = store.upsertBusiness({ name: 'Moorea Sail', lane: 'travel', website: 'mooreasail.pf' });
  const { opportunity } = store.createOpportunity(business.id);
  return { osDb, store, stages, id: opportunity.id };
}

test('transition table', () => {
  assert.equal(canMove('found', 'researched'), true);
  assert.equal(canMove('found', 'pitched'), false);
  assert.equal(canMove('pitched', 'replied'), true);
  assert.equal(canMove('closed_not_now', 'researched'), true);
  assert.equal(canMove('closed_no', 'researched'), false);
});

test('move changes stage, applies the patch, logs an event and bumps the version', () => {
  const { osDb, store, stages, id } = setup();
  stages.move(id, 'researched', { reason: 'fits', patch: { angle: 'New catamaran fleet', evidence: ['3 boats'], portfolio_ids: [1, 2] } });
  const opp = store.getOpportunity(id);
  assert.equal(opp.stage, 'researched');
  assert.equal(opp.angle, 'New catamaran fleet');
  assert.deepEqual(opp.evidence, ['3 boats']);
  assert.deepEqual(opp.portfolioIds, [1, 2]);
  assert.equal(opp.version, 1);
  assert.deepEqual(stages.events(id).map((e) => [e.from, e.to, e.reason]), [['', 'found', 'found by prospect search'], ['found', 'researched', 'fits']]);
  osDb.close();
});

test('invalid moves, unknown fields and stale versions are refused', () => {
  const { osDb, stages, id } = setup();
  assert.throws(() => stages.move(id, 'pitched'), /Cannot move .* from found to pitched/);
  assert.throws(() => stages.move(id, 'flying'), /Unknown stage/);
  assert.throws(() => stages.update(id, { stage: 'pitched' }), /Use move/);
  assert.throws(() => stages.update(id, { lane: 'winery' }), /Cannot set lane/);
  stages.update(id, { angle: 'a' });
  assert.throws(() => stages.update(id, { angle: 'b' }, { expectedVersion: 0 }), /changed/);
  assert.throws(() => stages.move('opp_missing', 'researched'), /not found/);
  osDb.close();
});

test('transition table covers late replies and unsubscribes', async () => {
  const { STAGES, OPEN_STAGES } = await import('../lib/os/gigs/constants.js');
  const { TRANSITIONS } = await import('../lib/os/gigs/stages.js');
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    assert.ok(STAGES.includes(from), from);
    for (const to of targets) assert.ok(STAGES.includes(to), to);
  }
  for (const stage of OPEN_STAGES) {
    assert.ok((TRANSITIONS[stage] ?? []).some((to) => to.startsWith('closed_')), `${stage} can reach a closed stage`);
  }
  assert.equal(canMove('closed_not_now', 'replied'), true);
  assert.equal(canMove('closed_lost', 'replied'), true);
  assert.equal(canMove('quoted', 'closed_not_now'), true);
  assert.equal(canMove('quoted', 'closed_unsubscribed'), true);
  assert.equal(canMove('held', 'closed_no'), true);
  assert.equal(canMove('held', 'closed_unsubscribed'), true);
  assert.equal(canMove('closed_not_now', 'closed_unsubscribed'), true);
});

test('a move with a bad patch key rolls back completely', () => {
  const { osDb, store, stages, id } = setup();
  assert.throws(() => stages.move(id, 'researched', { patch: { angle: 'x', lane: 'winery' } }), /Cannot set lane/);
  const opp = store.getOpportunity(id);
  assert.equal(opp.stage, 'found');
  assert.equal(opp.version, 0);
  assert.equal(opp.angle, '');
  assert.equal(stages.events(id).length, 1);
  osDb.close();
});

test('update bumps the version, writes no event and returns the new version', () => {
  const { osDb, store, stages, id } = setup();
  const result = stages.update(id, { angle: 'a' });
  assert.deepEqual(result, { stage: 'found', version: 1 });
  assert.equal(store.getOpportunity(id).version, 1);
  assert.equal(stages.events(id).length, 1);
  assert.deepEqual(stages.move(id, 'researched'), { from: 'found', to: 'researched', version: 2 });
  osDb.close();
});

test('expectedVersion: stale move throws, matching move succeeds', () => {
  const { osDb, stages, id } = setup();
  stages.update(id, { angle: 'a' });
  assert.throws(() => stages.move(id, 'researched', { expectedVersion: 0 }), /changed/);
  assert.equal(stages.move(id, 'researched', { expectedVersion: 1 }).version, 2);
  osDb.close();
});

test('null patch values: NOT NULL text columns become empty, nullable columns clear', () => {
  const { osDb, store, stages, id } = setup();
  stages.update(id, { angle: 'a', style: 'cinematic', subject: 's', last_message_id_header: 'h', close_reason: 'r', next_follow_up_at: '2026-01-01T00:00:00.000Z', follow_ups_sent: 2 });
  stages.update(id, { angle: null, style: undefined, subject: null, last_message_id_header: null, close_reason: null, follow_ups_sent: null, next_follow_up_at: null });
  const opp = store.getOpportunity(id);
  assert.equal(opp.angle, '');
  assert.equal(opp.style, '');
  assert.equal(opp.subject, '');
  assert.equal(opp.lastMessageIdHeader, '');
  assert.equal(opp.closeReason, '');
  assert.equal(opp.followUpsSent, 0);
  assert.equal(opp.nextFollowUpAt, null);
  osDb.close();
});

test('JSON columns must be arrays; patch must be a plain object', () => {
  const { osDb, store, stages, id } = setup();
  assert.throws(() => stages.update(id, { evidence: '["a"]' }), /array/);
  assert.throws(() => stages.update(id, null), /object/);
  assert.throws(() => stages.move(id, 'researched', { patch: [] }), /object/);
  stages.update(id, { evidence: null });
  assert.deepEqual(store.getOpportunity(id).evidence, []);
  osDb.close();
});

test('move and update work inside an outer transaction', () => {
  const { osDb, store, stages, id } = setup();
  osDb.transaction(() => {
    stages.update(id, { angle: 'a' });
    stages.move(id, 'researched', { actor: '' });
  });
  assert.equal(store.getOpportunity(id).stage, 'researched');
  assert.equal(stages.events(id).at(-1).actor, 'otg-os');
  osDb.close();
});
