import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createLedger } from '../lib/os/ledger.js';
import { createBudget } from '../lib/os/budget.js';
import { createApprovalGate } from '../lib/os/approvalGate.js';
import { createRegistry } from '../lib/os/registry.js';
import { demoTool } from '../lib/os/tools/demo.js';
import { createTeam } from '../lib/os/team.js';
import { createTelegramNotifier } from '../lib/os/telegram/notifier.js';
import { createTelegramBot } from '../lib/os/telegram/bot.js';

const JACK = 42;
const SWOPE = 7;

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

function setup({ ownerId = JACK } = {}) {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const ledger = createLedger(osDb);
  const gate = createApprovalGate(osDb);
  const budget = createBudget(osDb, settings);
  const api = fakeApi();
  const team = createTeam({ settings, ownerId, ownerName: 'Jack' });
  const notifier = createTelegramNotifier({ api, team });
  const registry = createRegistry({ ledger, gate, settings, notifier });
  registry.register(demoTool);
  const questions = [];
  const chat = { async ask(question) { questions.push(question); return `answer: ${question}`; } };
  const bot = createTelegramBot({ api, team, settings, ledger, registry, gate, budget, chat, log: () => {} });
  return { osDb, settings, ledger, gate, api, team, registry, bot, questions };
}

const message = (from, text, updateId = 1) => ({ update_id: updateId, message: { message_id: 1, from: { id: from, first_name: from === SWOPE ? 'Swope' : 'Someone' }, chat: { id: from }, text } });
const fromOwner = (text, updateId = 1) => message(JACK, text, updateId);
const press = (data, { from = JACK, messageId = 500 } = {}) => ({
  update_id: 2,
  callback_query: { id: 'cb1', from: { id: from }, data, message: { message_id: messageId, chat: { id: from }, text: 'approval text' } },
});
const propose = (registry, key = 'k1') => registry.request({
  tool: 'system.demo', payload: { draft: 'Hello there' }, why: { goal: 'Test', expected: 'Approved' }, idempotencyKey: key, urgent: true,
});

async function addSwope(ctx) {
  await ctx.bot.handleUpdate(message(SWOPE, '/start'));
  await ctx.bot.handleUpdate(press(`ta:${SWOPE}`));
}

test('a stranger gets an access request, and only the owner is asked', async () => {
  const { osDb, api, bot, team } = setup();
  await bot.handleUpdate(message(SWOPE, '/status'));
  assert.equal(api.sent[0].chatId, SWOPE);
  assert.match(api.sent[0].text, /asked Jack/);
  assert.equal(api.sent[1].chatId, JACK);
  assert.match(api.sent[1].text, /Swope.*wants access/);
  assert.deepEqual(api.sent[1].keyboard.inline_keyboard[0].map((button) => button.callback_data), [`ta:${SWOPE}`, `td:${SWOPE}`]);
  assert.equal(api.sent.some((sent) => /Approvals waiting/.test(sent.text)), false);
  assert.deepEqual(team.pendingRequests().map((request) => request.id), [SWOPE]);
  osDb.close();
});

test('the owner approving a request adds an admin and welcomes them', async () => {
  const ctx = setup();
  await addSwope(ctx);
  assert.deepEqual(ctx.team.get(SWOPE), { id: SWOPE, name: 'Swope', role: 'admin' });
  assert.equal(ctx.api.sent.at(-1).chatId, SWOPE);
  assert.match(ctx.api.sent.at(-1).text, /You're in/);
  ctx.osDb.close();
});

test('only the owner can approve access requests', async () => {
  const ctx = setup();
  await addSwope(ctx);
  await ctx.bot.handleUpdate(message(99, '/start'));
  await ctx.bot.handleUpdate(press('ta:99', { from: SWOPE }));
  assert.equal(ctx.team.isMember(99), false);
  assert.match(ctx.api.answers.at(-1).text, /Only Jack/);
  ctx.osDb.close();
});

test('without an owner ID the bot tells the sender their ID', async () => {
  const { osDb, api, bot } = setup({ ownerId: null });
  await bot.handleUpdate(message(777, '/start'));
  assert.equal(api.sent[0].chatId, 777);
  assert.match(api.sent[0].text, /TELEGRAM_OWNER_ID=777/);
  osDb.close();
});

test('approvals go to every member and whoever approves is recorded on all copies', async () => {
  const ctx = setup();
  await addSwope(ctx);
  const action = await propose(ctx.registry);
  const copies = ctx.ledger.telegramMessages(action.id);
  assert.deepEqual(copies.map((copy) => copy.chatId).sort(), [SWOPE, JACK].sort());
  await ctx.bot.handleUpdate(press(`a:${action.id}`, { from: SWOPE }));
  assert.equal(ctx.ledger.get(action.id).status, 'approved');
  assert.equal(ctx.ledger.get(action.id).approvedBy, 'Swope');
  const edited = ctx.api.edits.filter((edit) => /Approved by Swope/.test(edit.text)).map((edit) => edit.messageId).sort();
  assert.deepEqual(edited, copies.map((copy) => copy.messageId).sort());
  ctx.osDb.close();
});

test('the approve button works for the owner and rejects a second press', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.equal(ledger.get(action.id).approvedBy, 'Jack');
  assert.equal(api.answers[0].text, 'Approved');
  await bot.handleUpdate(press(`a:${action.id}`));
  assert.match(api.answers[1].text, /expected proposed/);
  osDb.close();
});

test('the reject button asks why, then records the reason on every copy', async () => {
  const { osDb, api, bot, ledger, registry } = setup();
  const action = await propose(registry);
  const [copy] = ledger.telegramMessages(action.id);
  await bot.handleUpdate(press(`r:${action.id}`));
  assert.equal(api.sent.at(-1).text, 'Why are you rejecting it?');
  await bot.handleUpdate(press(`rr:${action.id}:wrong_tone`, { messageId: 600 }));
  const rejected = ledger.get(action.id);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectReason, 'wrong_tone');
  const editedIds = api.edits.map((edit) => edit.messageId);
  assert.ok(editedIds.includes(600));
  assert.ok(editedIds.includes(copy.messageId));
  assert.match(api.edits.find((edit) => edit.messageId === copy.messageId).text, /Rejected by Jack/);
  osDb.close();
});

test('edit flow is tracked per person', async () => {
  const ctx = setup();
  await addSwope(ctx);
  const action = await propose(ctx.registry);
  await ctx.bot.handleUpdate(press(`e:${action.id}`, { from: SWOPE }));
  assert.equal(ctx.settings.get('telegram.pending_edits')[String(SWOPE)], action.id);
  await ctx.bot.handleUpdate(fromOwner('What is booked this week?'));
  assert.deepEqual(ctx.questions, ['What is booked this week?']);
  await ctx.bot.handleUpdate(message(SWOPE, 'New text please'));
  assert.equal(ctx.settings.get('telegram.pending_edits')[String(SWOPE)], undefined);
  assert.equal(ctx.ledger.get(action.id).payload.draft, 'New text please');
  assert.match(ctx.api.sent.at(-1).text, /New text please/);
  ctx.osDb.close();
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

test('team command lists members and the owner can remove an admin', async () => {
  const ctx = setup();
  await addSwope(ctx);
  await ctx.bot.handleUpdate(fromOwner('/team'));
  assert.match(ctx.api.sent.at(-1).text, /Jack \(owner\)/);
  assert.match(ctx.api.sent.at(-1).text, /Swope \(admin\)/);
  await ctx.bot.handleUpdate(message(SWOPE, '/remove Jack'));
  assert.match(ctx.api.sent.at(-1).text, /Only Jack/);
  await ctx.bot.handleUpdate(fromOwner('/remove Swope'));
  assert.equal(ctx.team.isMember(SWOPE), false);
  ctx.osDb.close();
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

test('plain text goes to the chat', async () => {
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
  api.updates = [fromOwner('/status', 10), { update_id: 11, message: { from: { id: JACK }, text: 'no chat field' } }];
  assert.equal(await bot.pollOnce(0), 2);
  assert.equal(settings.get('telegram.update_offset'), 12);
  osDb.close();
});
