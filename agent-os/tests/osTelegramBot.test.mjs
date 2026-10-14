import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createRegistry } from '../lib/os/registry.js';
import { demoTool } from '../lib/os/tools/demo.js';
import { createTelegramNotifier } from '../lib/os/telegram/notifier.js';
import { createTelegramBot } from '../lib/os/telegram/bot.js';

function fakeApi() {
  let nextId = 100;
  return {
    sent: [],
    edits: [],
    answers: [],
    updates: [],
    async sendMessage(chatId, text, keyboard) { this.sent.push({ chatId, text, keyboard }); return { message_id: nextId++ }; },
    async editMessageText(chatId, messageId, text) { this.edits.push({ chatId, messageId, text }); return true; },
    async answerCallbackQuery(id, text) { this.answers.push({ id, text }); return true; },
    async getUpdates() { const updates = this.updates; this.updates = []; return updates; },
  };
}

function setup({ ownerId = 42 } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const gate = createApprovalGate(osDb);
  const budget = createBudget(osDb, settings);
  const api = fakeApi();
  const notifier = createTelegramNotifier({ api, ownerId: 42 });
  const registry = createRegistry({ ledger, gate, settings, notifier });
  registry.register(demoTool);
  const questions = [];
  const chat = { async ask(question) { questions.push(question); return `answer: ${question}`; } };
  const bot = createTelegramBot({ api, ownerId, settings, ledger, registry, gate, budget, chat, log: () => {} });
  return { osDb, settings, ledger, gate, api, registry, bot, questions };
}

const fromOwner = (text, updateId = 1) => ({ update_id: updateId, message: { message_id: 1, from: { id: 42 }, chat: { id: 42 }, text } });
const press = (data, messageId = 500) => ({
  update_id: 2,
  callback_query: { id: 'cb1', from: { id: 42 }, data, message: { message_id: messageId, chat: { id: 42 }, text: 'approval text' } },
});
const propose = (registry, key = 'k1') => registry.request({
  tool: 'system.demo', payload: { draft: 'Hello there' }, why: { goal: 'Test', expected: 'Approved' }, idempotencyKey: key, urgent: true,
});

test('messages from anyone but the owner are ignored', async () => {
  const { osDb, api, bot } = setup();
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, from: { id: 999 }, chat: { id: 999 }, text: '/status' } });
  assert.equal(api.sent.length, 0);
  osDb.close();
});

test('without an owner ID the bot tells the sender their ID', async () => {
  const { osDb, api, bot } = setup({ ownerId: null });
  await bot.handleUpdate({ update_id: 1, message: { message_id: 1, from: { id: 777 }, chat: { id: 777 }, text: '/start' } });
  assert.equal(api.sent[0].chatId, 777);
  assert.match(api.sent[0].text, /TELEGRAM_OWNER_ID=777/);
  osDb.close();
});

test('the approve button approves and marks the message', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.equal(ledger.get(action.id).status, 'approved');
  assert.match(api.edits[0].text, /Approved/);
  assert.equal(api.answers[0].text, 'Approved');
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.match(api.answers[1].text, /expected proposed/);
  osDb.close();
});

test('the reject button asks why, then records the reason', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  const approvalMessageId = ledger.get(action.id).telegramMessageId;
  await bot.handleUpdate(press(`r:${action.id}`));
  assert.equal(api.sent.at(-1).text, 'Why are you rejecting it?');
  await bot.handleUpdate(press(`rr:${action.id}:wrong_tone`, 600));
  const rejected = ledger.get(action.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectReason, 'wrong_tone');
  const editedIds = api.edits.map((edit) => edit.messageId);
  assert.ok(editedIds.includes(600));
  assert.ok(editedIds.includes(approvalMessageId));
  osDb.close();
});

test('edit flow: the next message becomes the new draft and is re-sent', async () => {
  const { osDb, api, bot, ledger, registry, settings } = setup();
  const action = await propose(registry);
  await bot.handleUpdate(press(`e:${action.id}`));
  assert.equal(settings.get('telegram.pending_edit_action_id'), action.id);
  await bot.handleUpdate(fromOwner('New text please'));
  assert.equal(settings.get('telegram.pending_edit_action_id'), '');
  assert.equal(ledger.get(action.id).payload.draft, 'New text please');
  assert.match(api.sent.at(-1).text, /New text please/);
  osDb.close();
});

test('pause and resume toggle the pause flag', async () => {
  const { osDb, bot, settings } = setup();
  await bot.handleUpdate(fromOwner('/pause'));
  assert.equal(settings.get('os.paused'), true);
  await bot.handleUpdate(fromOwner('/resume'));
  assert.equal(settings.get('os.paused'), false);
  osDb.close();
});

test('budget and status commands report spend and waiting approvals', async () => {
  const { osDb, api, bot, registry } = setup();
  await propose(registry);
  await bot.handleUpdate(fromOwner('/budget'));
  assert.match(api.sent.at(-1).text, /\$0\.00 of \$150\.00/);
  assert.match(api.sent.at(-1).text, /scrapecreators: 0 of 20 today/);
  await bot.handleUpdate(fromOwner('/status'));
  assert.match(api.sent.at(-1).text, /Approvals waiting: 1/);
  osDb.close();
});

test('approvals command re-sends everything waiting', async () => {
  const { osDb, api, bot, registry } = setup();
  await propose(registry, 'k1');
  await propose(registry, 'k2');
  const before = api.sent.length;
  await bot.handleUpdate(fromOwner('/approvals'));
  assert.equal(api.sent.length, before + 2);
  osDb.close();
});

test('plain text goes to the owner chat', async () => {
  const { osDb, api, bot, questions } = setup();
  await bot.handleUpdate(fromOwner('What is booked this week?'));
  assert.deepEqual(questions, ['What is booked this week?']);
  assert.equal(api.sent.at(-1).text, 'answer: What is booked this week?');
  osDb.close();
});

test('the promote button raises the autonomy level', async () => {
  const { osDb, bot, gate } = setup();
  await bot.handleUpdate(press('p:calendar.hold'));
  assert.equal(gate.get('calendar.hold').level, 'silent');
  osDb.close();
});

test('pollOnce advances the offset even when an update fails', async () => {
  const { osDb, api, bot, settings } = setup();
  api.updates = [fromOwner('/status', 10), { update_id: 11, message: { from: { id: 42 }, text: 'no chat field' } }];
  assert.equal(await bot.pollOnce(0), 2);
  assert.equal(settings.get('telegram.update_offset'), 12);
  osDb.close();
});
