export function createTelegramApi({ token, fetchImpl = fetch }) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, body, timeoutMs = 30_000) {
    const response = await fetchImpl(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? 'unknown error'}`);
    return data.result;
  }

  return {
    getUpdates: (offset, timeout = 25) =>
      call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }, (timeout + 10) * 1000),
    sendMessage: (chatId, text, replyMarkup) =>
      call('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    editMessageText: (chatId, messageId, text) =>
      call('editMessageText', { chat_id: chatId, message_id: messageId, text }),
    answerCallbackQuery: (callbackQueryId, text) =>
      call('answerCallbackQuery', { callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
  };
}
