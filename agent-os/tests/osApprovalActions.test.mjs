import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createRegistry } from '../lib/os/registry.js';
import { demoTool } from '../lib/os/tools/demo.js';
import { createApprovalActions } from '../lib/os/approvalActions.js';

function setup({ withApi = true } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const gate = createApprovalGate(osDb);
  const presented = [];
  let nextId = 100;
  const notifier = {
    async requestApproval(action) { presented.push(action.id); return [{ chatId: 42, messageId: nextId++ }, { chatId: 7, messageId: nextId++ }]; },
    async tell() {}, async alert() {}, async offerPromotion() {},
  };
  const registry = createRegistry({ ledger, gate, settings, notifier });
  registry.register(demoTool);
  const edits = [];
  const api = withApi ? { async editMessageText(chatId, messageId, text) { edits.push({ chatId, messageId, text }); } } : null;
  const approvals = createApprovalActions({ ledger, registry, api, log: () => {} });
  const propose = (key = 'k1') => registry.request({
    tool: 'system.demo', payload: { draft: 'Hello there' }, why: { goal: 'Test', expected: 'Approved' }, idempotencyKey: key, urgent: true,
  });
  return { osDb, ledger, gate, registry, approvals, edits, presented, propose };
}

test('approve goes through the registry and updates every Telegram copy', async () => {
  const ctx = setup();
  const action = await ctx.propose();
  const approved = await ctx.approvals.approve(action.id, { by: 'Jack (dashboard)' });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.approvedBy, 'Jack (dashboard)');
  assert.equal(ctx.edits.length, 2);
  assert.deepEqual(ctx.edits.map((edit) => edit.chatId), [42, 7]);
  assert.match(ctx.edits[0].text, /✅ Approved by Jack \(dashboard\)/);
  await assert.rejects(() => ctx.approvals.approve(action.id, { by: 'Jack' }), /is approved; expected proposed/);
  ctx.osDb.close();
});

test('reject keeps known reasons, turns unknown ones into other, and counts toward demotion', async () => {
  const ctx = setup();
  const first = await ctx.propose('r1');
  const { action, label } = await ctx.approvals.reject(first.id, { reason: 'wrong_tone', by: 'Swope' });
  assert.equal(action.status, 'rejected');
  assert.equal(action.rejectReason, 'wrong_tone');
  assert.equal(label, 'Wrong tone');
  assert.match(ctx.edits.at(-1).text, /❌ Rejected by Swope \(Wrong tone\)/);
  const second = await ctx.propose('r2');
  const result = await ctx.approvals.reject(second.id, { reason: 'made_up', by: 'Jack' });
  assert.equal(result.action.rejectReason, 'other');
  assert.equal(result.label, 'Other');
  ctx.osDb.close();
});

test('revise marks the old copies edited, saves the new draft and presents it again', async () => {
  const ctx = setup();
  const action = await ctx.propose();
  const revised = await ctx.approvals.revise(action.id, '  New words  ', { by: 'Jack' });
  assert.equal(revised.status, 'proposed');
  assert.equal(revised.payload.draft, 'New words');
  assert.equal(revised.originalDraft, 'Hello there');
  assert.match(ctx.edits[0].text, /✏️ Edited by Jack/);
  assert.equal(ctx.presented.length, 2);
  await assert.rejects(() => ctx.approvals.revise(action.id, '   ', { by: 'Jack' }), /empty/);
  await ctx.approvals.approve(action.id, { by: 'Jack' });
  const editsBefore = ctx.edits.length;
  await assert.rejects(() => ctx.approvals.revise(action.id, 'Late', { by: 'Jack' }), /no longer waiting/);
  assert.equal(ctx.edits.length, editsBefore, 'nothing is edited when the action is not waiting');
  assert.ok(ctx.ledger.get(action.id).editRatio > 0);
  ctx.osDb.close();
});

test('works without Telegram, and describe falls back to the draft for unknown tools', async () => {
  const ctx = setup({ withApi: false });
  const action = await ctx.propose();
  await ctx.approvals.approve(action.id, { by: 'dashboard' });
  assert.equal(ctx.edits.length, 0);
  assert.equal(ctx.approvals.describe({ tool: 'nope', payload: { draft: 'Raw draft' } }), 'Raw draft');
  assert.match(ctx.approvals.describe(ctx.ledger.get(action.id)), /Hello there/);
  ctx.osDb.close();
});
