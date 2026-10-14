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
