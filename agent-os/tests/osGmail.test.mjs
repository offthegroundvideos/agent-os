// tests/osGmail.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMime, createGmail, parseMessage } from '../lib/os/tools/gmail.js';

const decodeRaw = (raw) => Buffer.from(raw, 'base64url').toString('utf8');

test('buildMime makes a plain-text email with threading headers', () => {
  const raw = decodeRaw(buildMime({ from: 'Jack <jack@otg.com>', to: 'kim@vine.com', subject: 'Re: Barrel room films', text: 'Hi Kim', inReplyTo: '<abc@x>' }));
  assert.match(raw, /^From: Jack <jack@otg.com>\r\nTo: kim@vine.com\r\nSubject: Re: Barrel room films\r\n/);
  assert.match(raw, /In-Reply-To: <abc@x>\r\nReferences: <abc@x>/);
  const body = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Hi Kim');
  assert.match(decodeRaw(buildMime({ from: 'a', to: 'b', subject: 'Tahiti — été', text: 'x' })), /Subject: =\?UTF-8\?B\?/);
});

test('parseMessage reads headers and the plain-text part', () => {
  const message = parseMessage({
    id: 'a', threadId: 't1', snippet: 'Sounds great', labelIds: ['INBOX'],
    payload: {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'From', value: 'Kim <kim@vine.com>' }, { name: 'Subject', value: 'Re: Hi' }, { name: 'Message-ID', value: '<k@vine>' }],
      parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Sounds great, call me').toString('base64url') } }, { mimeType: 'text/html', body: { data: 'eA' } }],
    },
  });
  assert.deepEqual(
    [message.from, message.subject, message.messageIdHeader, message.text, message.threadId, message.labelIds],
    ['Kim <kim@vine.com>', 'Re: Hi', '<k@vine>', 'Sounds great, call me', 't1', ['INBOX']],
  );
});

function fakeGoogle() {
  const calls = [];
  const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body, auth: init.headers?.authorization });
    if (u === 'https://oauth2.googleapis.com/token') return json({ access_token: 'tok', expires_in: 3600 });
    if (u.endsWith('/messages/send')) return json({ id: 'm1', threadId: 't1' });
    if (u.endsWith('/drafts')) return json({ id: 'd1', message: { id: 'm2', threadId: 't2' } });
    if (u.includes('format=metadata&metadataHeaders=Message-ID') && u.includes('/messages/')) {
      return json({ id: 'm', threadId: 't', payload: { headers: [{ name: 'Message-ID', value: '<sent@mail>' }] } });
    }
    if (u.includes('/messages?q=')) return json({ messages: [{ id: 'a', threadId: 'ta' }, { id: 'b', threadId: 'tb' }] });
    if (u.includes('/threads/t1')) return json({ id: 't1', messages: [{ id: 'm1', threadId: 't1', labelIds: ['SENT'], payload: { headers: [{ name: 'Message-ID', value: '<sent@mail>' }] } }] });
    return json({ error: { message: 'not found' } }, 404);
  };
  return { calls, fetchImpl };
}

test('send, draft, search and thread calls share one cached token', async () => {
  const { calls, fetchImpl } = fakeGoogle();
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  const sent = await gmail.send({ from: 'a', to: 'b', subject: 'Hi', text: 'x', threadId: 't0' });
  assert.deepEqual(sent, { id: 'm1', threadId: 't1', messageIdHeader: '<sent@mail>' });
  const sendCall = calls.find((call) => call.url.endsWith('/messages/send'));
  assert.equal(sendCall.auth, 'Bearer tok');
  assert.equal(JSON.parse(sendCall.body).threadId, 't0');
  assert.deepEqual(await gmail.createDraft({ from: 'a', to: 'b', subject: 'Hi', text: 'x' }), { id: 'm2', draftId: 'd1', threadId: 't2', messageIdHeader: '<sent@mail>' });
  assert.deepEqual(await gmail.search('in:inbox newer_than:3d'), [{ id: 'a', threadId: 'ta' }, { id: 'b', threadId: 'tb' }]);
  const thread = await gmail.thread('t1');
  assert.deepEqual(thread.messages.map((m) => [m.labelIds, m.messageIdHeader]), [[['SENT'], '<sent@mail>']]);
  assert.equal(calls.filter((call) => call.url.includes('oauth2')).length, 1);
  const tokenBody = calls[0].body.toString();
  assert.match(tokenBody, /grant_type=refresh_token/);
  await assert.rejects(gmail.getMessage('zzz'), /Gmail GET \/messages\/zzz failed: 404 not found/);
});
