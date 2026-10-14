import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createApprovalGate, PROMOTION_THRESHOLD } from '../lib/os/approvalGate.js';

function setup() {
  const osDb = openOsDb(':memory:');
  return { osDb, gate: createApprovalGate(osDb) };
}

test('starting levels follow the spec table', () => {
  const { osDb, gate } = setup();
  assert.equal(gate.levelFor('research.prospect_list'), 'silent');
  assert.equal(gate.levelFor('calendar.hold'), 'tell');
  assert.equal(gate.levelFor('email.first_contact'), 'ask');
  assert.equal(gate.levelFor('quote.large_or_custom'), 'ask');
  assert.equal(gate.levelFor('something.unknown'), 'ask');
  assert.equal(gate.get('something.unknown').ceiling, 'ask');
  osDb.close();
});

test('20 clean approvals offer one promotion', () => {
  const { osDb, gate } = setup();
  for (let i = 1; i < PROMOTION_THRESHOLD; i += 1) {
    assert.equal(gate.recordApproval('email.follow_up', 0).promotionOffer, null);
  }
  const offer = gate.recordApproval('email.follow_up', 0).promotionOffer;
  assert.deepEqual(offer, { actionType: 'email.follow_up', from: 'ask', to: 'tell' });
  assert.equal(gate.recordApproval('email.follow_up', 0).promotionOffer, null);
  assert.equal(gate.promote('email.follow_up').level, 'tell');
  assert.equal(gate.get('email.follow_up').cleanApprovals, 0);
  osDb.close();
});

test('first contact can never be promoted', () => {
  const { osDb, gate } = setup();
  for (let i = 0; i < 25; i += 1) {
    assert.equal(gate.recordApproval('email.first_contact', 0).promotionOffer, null);
  }
  assert.throws(() => gate.promote('email.first_contact'), /ceiling/);
  osDb.close();
});

test('a small edit resets the clean streak and a heavy edit demotes to ask', () => {
  const { osDb, gate } = setup();
  gate.promote('email.follow_up');
  gate.recordApproval('email.follow_up', 0);
  const small = gate.recordApproval('email.follow_up', 0.1);
  assert.equal(small.policy.cleanApprovals, 0);
  assert.equal(small.policy.level, 'tell');
  const heavy = gate.recordApproval('email.follow_up', 0.3);
  assert.equal(heavy.demoted, true);
  assert.equal(heavy.policy.level, 'ask');
  assert.equal(heavy.policy.lastDemotionReason, 'heavy_edit');
  osDb.close();
});

test('two rejections in a row demote to ask', () => {
  const { osDb, gate } = setup();
  gate.promote('email.follow_up');
  assert.equal(gate.recordRejection('email.follow_up').demoted, false);
  const second = gate.recordRejection('email.follow_up');
  assert.equal(second.demoted, true);
  assert.equal(second.policy.level, 'ask');
  assert.equal(second.policy.lastDemotionReason, 'repeated_rejections');
  osDb.close();
});

test('declining a promotion restarts the count', () => {
  const { osDb, gate } = setup();
  for (let i = 0; i < PROMOTION_THRESHOLD; i += 1) gate.recordApproval('quote.standard', 0);
  const policy = gate.declinePromotion('quote.standard');
  assert.equal(policy.level, 'ask');
  assert.equal(policy.cleanApprovals, 0);
  assert.equal(policy.promotionOfferedAt, null);
  osDb.close();
});

test('demote is available for outside triggers like bounces', () => {
  const { osDb, gate } = setup();
  gate.promote('calendar.hold');
  assert.equal(gate.demote('calendar.hold', 'bounce_spike').level, 'ask');
  assert.equal(gate.list().find((policy) => policy.actionType === 'calendar.hold').lastDemotionReason, 'bounce_spike');
  osDb.close();
});
