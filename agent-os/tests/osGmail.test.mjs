// tests/osGmail.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMime, createGmail, parseMessage } from '../lib/os/tools/gmail.js';

const decodeRaw = (raw) => Buffer.from(raw, 'base64url').toString('utf8');

test('buildMime makes a plain-text email with threading headers', () => {
  const raw = decodeRaw(buildMime({ from: 'Jack <jack@otg.com>', to: 'kim@vine.com', subject: 'Re: Barrel room films', text: 'Hi Kim', inReplyTo: '<abc@x>' }));
  assert.match(raw, /^From: Jack <jack@otg.com>\r\nTo: kim@vine.com\r\nSubject: Re: Barrel room films\r\n/);
  assert.match(raw, /In-Reply-To: <abc@x>\r\nReferences: <abc@x>/);
  // An ASCII body now goes out as 7bit (see the deliverability test below), so it is readable as-is.
  assert.equal(raw.split('\r\n\r\n')[1], 'Hi Kim');
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

const mail = { from: 'a@x.com', to: 'b@x.com', subject: 'Hi', text: 'x' };

test('buildMime refuses header injection and missing required fields', () => {
  for (const field of ['from', 'to', 'subject', 'inReplyTo', 'references']) {
    for (const bad of ['a\r\nBcc: evil@x.com', 'a\nb', 'a\rb', 'a\0b']) {
      assert.throws(() => buildMime({ ...mail, [field]: bad }), new RegExp(`Invalid ${field}: line break in header value`));
    }
  }
  for (const field of ['to', 'subject', 'text']) {
    assert.throws(() => buildMime({ ...mail, [field]: '' }), new RegExp(field));
    assert.throws(() => buildMime({ ...mail, [field]: '   ' }), new RegExp(field));
    assert.throws(() => buildMime({ ...mail, [field]: undefined }), new RegExp(field));
  }
});

test('buildMime sends ASCII bodies as 7bit with CRLF and non-ASCII bodies as base64', () => {
  const ascii = decodeRaw(buildMime({ ...mail, text: 'Line one\nLine two\r\nLine three' }));
  assert.match(ascii, /Content-Transfer-Encoding: 7bit\r\n/);
  assert.equal(ascii.split('\r\n\r\n')[1], 'Line one\r\nLine two\r\nLine three');
  const utf = decodeRaw(buildMime({ ...mail, text: 'Café\nau lait' }));
  assert.match(utf, /Content-Transfer-Encoding: base64\r\n/);
  const body = utf.split('\r\n\r\n')[1].replace(/\r\n/g, '');
  assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Café\r\nau lait');
});

test('parseMessage decodes the declared charset', () => {
  const message = parseMessage({
    id: 'a', threadId: 't',
    payload: { mimeType: 'multipart/alternative', headers: [], parts: [
      { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset="ISO-8859-1"' }], body: { data: Buffer.from('caf\xe9', 'latin1').toString('base64url') } },
    ] },
  });
  assert.equal(message.text, 'café');
  const unknown = parseMessage({
    id: 'a', threadId: 't',
    payload: { mimeType: 'multipart/alternative', parts: [
      { mimeType: 'text/plain', headers: [{ name: 'Content-Type', value: 'text/plain; charset=nonsense-9' }], body: { data: Buffer.from('café').toString('base64url') } },
    ] },
  });
  assert.equal(unknown.text, 'café');
});

test('parseMessage turns an HTML-only reply into text and skips attachments', () => {
  const html = '<style>p{color:red}</style><div>Hi&nbsp;Kim,</div><p>Tom &amp; Jerry &lt;3 &quot;ok&quot; it&#39;s</p>line<br>two<script>alert(1)</script>';
  const message = parseMessage({
    id: 'a', threadId: 't', snippet: 'snip',
    payload: { mimeType: 'multipart/mixed', parts: [
      { mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url') } },
      { mimeType: 'text/plain', filename: 'notes.txt', body: { data: Buffer.from('ATTACHED').toString('base64url') } },
    ] },
  });
  assert.equal(message.text, 'Hi Kim,\nTom & Jerry <3 "ok" it\'s\nline\ntwo');
  const empty = parseMessage({ id: 'b', threadId: 't', snippet: 'Only a snippet', payload: { mimeType: 'multipart/mixed', parts: [{ mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'x' } }] } });
  assert.equal(empty.text, 'Only a snippet');
});

const jsonResponse = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test('send still resolves when the Message-ID lookup fails', async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('oauth2')) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
    if (u.endsWith('/messages/send')) return jsonResponse({ id: 'm1', threadId: 't1' });
    if (u.endsWith('/drafts')) return jsonResponse({ id: 'd1', message: { id: 'm2', threadId: 't2' } });
    return jsonResponse({ error: { message: 'slow down' } }, 429);
  };
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  assert.deepEqual(await gmail.send(mail), { id: 'm1', threadId: 't1', messageIdHeader: '' });
  assert.deepEqual(await gmail.createDraft(mail), { id: 'm2', draftId: 'd1', threadId: 't2', messageIdHeader: '' });
});

test('a 401 clears the cached token and retries once', async () => {
  let tokens = 0;
  let apiCalls = 0;
  const auths = [];
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('oauth2')) { tokens += 1; return jsonResponse({ access_token: `tok${tokens}`, expires_in: 3600 }); }
    apiCalls += 1;
    auths.push(init.headers.authorization);
    return apiCalls === 1 ? jsonResponse({ error: { message: 'expired' } }, 401) : jsonResponse({ messages: [{ id: 'a', threadId: 'ta' }] });
  };
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  assert.deepEqual(await gmail.search('x'), [{ id: 'a', threadId: 'ta' }]);
  assert.equal(tokens, 2);
  assert.deepEqual(auths, ['Bearer tok1', 'Bearer tok2']);
  // A second 401 is not retried forever.
  const stuck = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl: async (url) => (String(url).includes('oauth2') ? jsonResponse({ access_token: 't', expires_in: 3600 }) : jsonResponse({ error: { message: 'no' } }, 401)) });
  await assert.rejects(stuck.search('x'), /failed: 401 no/);
});

test('parallel calls on a cold cache share one token refresh, and a bad refresh reply is a clean error', async () => {
  let tokens = 0;
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('oauth2')) { tokens += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return jsonResponse({ access_token: 'tok', expires_in: 3600 }); }
    return jsonResponse({ messages: [] });
  };
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  await Promise.all([gmail.search('a'), gmail.search('b'), gmail.search('c')]);
  assert.equal(tokens, 1);
  const broken = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }) });
  await assert.rejects(broken.search('a'), /Google sign-in refresh failed: 502/);
});

test('ids are URL-encoded and thread() asks for Subject and References', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('oauth2')) return jsonResponse({ access_token: 'tok', expires_in: 3600 });
    if (u.includes('/threads/')) return jsonResponse({ id: 't', messages: [] });
    return jsonResponse({ id: 'x', payload: { headers: [] } });
  };
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  await gmail.getMessage('a/b?c');
  await gmail.thread('t/1#x');
  assert.ok(urls.some((u) => u.includes('/messages/a%2Fb%3Fc?format=full')));
  const threadUrl = urls.find((u) => u.includes('/threads/'));
  assert.ok(threadUrl.includes('/threads/t%2F1%23x?'));
  assert.match(threadUrl, /metadataHeaders=Subject/);
  assert.match(threadUrl, /metadataHeaders=References/);
});

test('search follows nextPageToken until it has max results or runs out of pages', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('oauth2')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 3600 }) };
    urls.push(u);
    const page = u.includes('pageToken=p2')
      ? { messages: [{ id: 'c', threadId: 'tc' }, { id: 'd', threadId: 'td' }] }
      : { messages: [{ id: 'a', threadId: 'ta' }, { id: 'b', threadId: 'tb' }], nextPageToken: 'p2' };
    return { ok: true, status: 200, json: async () => page };
  };
  const gmail = createGmail({ clientId: 'c', clientSecret: 's', refreshToken: 'r', fetchImpl });
  assert.deepEqual((await gmail.search('x', 10)).map((m) => m.id), ['a', 'b', 'c', 'd']);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /maxResults=10(&|$)/);
  assert.doesNotMatch(urls[0], /pageToken/);
  assert.match(urls[1], /maxResults=8(&|$)/);
  assert.match(urls[1], /pageToken=p2/);
  // Stops at max even when more pages exist.
  urls.length = 0;
  assert.deepEqual((await gmail.search('x', 3)).map((m) => m.id), ['a', 'b', 'c']);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /maxResults=1(&|$)/);
  // Page size is capped at 500.
  urls.length = 0;
  await gmail.search('x', 1000);
  assert.match(urls[0], /maxResults=500(&|$)/);
});
