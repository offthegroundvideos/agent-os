import test from 'node:test';
import assert from 'node:assert/strict';
import { createTelegramApi } from '../lib/os/telegram/api.js';
import { approvalKeyboard, approvalText, promotionKeyboard, rejectReasonKeyboard, truncate } from '../lib/os/telegram/format.js';
import { createConsoleNotifier, createTelegramNotifier } from '../lib/os/telegram/notifier.js';

test('telegram api posts JSON to the bot endpoint and returns the result', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { json: async () => ({ ok: true, result: { message_id: 7 } }) };
  };
  const api = createTelegramApi({ token: 'T0K', fetchImpl });
  const result = await api.sendMessage(42, 'hi', { inline_keyboard: [] });
  assert.equal(result.message_id, 7);
  assert.equal(calls[0].url, 'https://api.telegram.org/botT0K/sendMessage');
  assert.deepEqual(calls[0].body, { chat_id: 42, text: 'hi', reply_markup: { inline_keyboard: [] } });
  await api.getUpdates(5, 25);
  assert.deepEqual(calls[1].body, { offset: 5, timeout: 25, allowed_updates: ['message', 'callback_query'] });
});

test('telegram api throws with the error description', async () => {
  const api = createTelegramApi({ token: 'T0K', fetchImpl: async () => ({ json: async () => ({ ok: false, description: 'Bad Request: chat not found' }) }) });
  await assert.rejects(() => api.sendMessage(1, 'x'), /chat not found/);
});

const action = {
  id: 'act_123e4567-e89b-12d3-a456-426614174000',
  actionType: 'email.follow_up',
  why: { goal: 'Book a Napa winery', expected: 'Reply within a week', evidence: ['Hosts weddings', 'Active Instagram'] },
};

test('approval text shows the description and the why', () => {
  const text = approvalText(action, 'Follow up with Napa Valley Estate');
  assert.match(text, /Approval needed · email\.follow_up/);
  assert.match(text, /Follow up with Napa Valley Estate/);
  assert.match(text, /Why: Book a Napa winery/);
  assert.match(text, /Expected: Reply within a week/);
  assert.match(text, /Evidence: Hosts weddings; Active Instagram/);
});

test('button data stays under Telegram 64-byte limit', () => {
  const buttons = [
    ...approvalKeyboard(action.id).inline_keyboard.flat(),
    ...rejectReasonKeyboard(action.id).inline_keyboard.flat(),
    ...promotionKeyboard('email.booking_confirmation').inline_keyboard.flat(),
  ];
  for (const button of buttons) assert.ok(Buffer.byteLength(button.callback_data) <= 64, button.callback_data);
});

test('truncate keeps messages under the limit', () => {
  assert.equal(truncate('x'.repeat(5000)).length, 3500);
  assert.equal(truncate('short'), 'short');
});

const fakeTeam = (...ids) => ({ members: () => ids.map((id) => ({ id, name: `user${id}` })) });

test('telegram notifier sends approvals with buttons and returns every copy', async () => {
  const sent = [];
  const api = { async sendMessage(chatId, text, keyboard) { sent.push({ chatId, text, keyboard }); return { message_id: 99 }; } };
  const notifier = createTelegramNotifier({ api, team: fakeTeam(42) });
  assert.deepEqual(await notifier.requestApproval(action, 'Follow up'), [{ chatId: 42, messageId: 99 }]);
  assert.equal(sent[0].chatId, 42);
  assert.equal(sent[0].keyboard.inline_keyboard[0].length, 3);
  await notifier.offerPromotion({ actionType: 'email.follow_up', from: 'ask', to: 'tell' });
  assert.match(sent[1].text, /from Ask to Tell/);
});

test('one member failing does not stop the others, but everyone failing throws', async () => {
  const api = { async sendMessage(chatId) { if (chatId === 7) throw new Error('blocked'); return { message_id: chatId * 10 }; } };
  const lines = [];
  const notifier = createTelegramNotifier({ api, team: fakeTeam(42, 7), log: (line) => lines.push(line) });
  assert.deepEqual(await notifier.requestApproval(action, 'Follow up'), [{ chatId: 42, messageId: 420 }]);
  assert.match(lines[0], /user7 failed: blocked/);
  const broken = createTelegramNotifier({ api, team: fakeTeam(7), log: () => {} });
  await assert.rejects(broken.alert('x'), /blocked/);
});

test('console notifier logs and returns no message id', async () => {
  const lines = [];
  const notifier = createConsoleNotifier((line) => lines.push(line));
  assert.equal(await notifier.requestApproval(action, 'Follow up'), null);
  assert.match(lines[0], /approval needed/);
});
