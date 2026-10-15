// lib/os/tools/gmail.js
// Minimal Gmail REST client. Auth is an OAuth refresh token from scripts/otg-os-google-auth.mjs.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// calendar.events is requested now so Plan 3 (holds and bookings) doesn't need a second sign-in.
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

function encodeHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export function buildMime({ from, to, subject, text, inReplyTo = '', references = '' }) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(String(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`);
  const body = Buffer.from(String(text), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

export function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const texts = [];
  const walk = (part) => {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body?.data) texts.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
    (part.parts ?? []).forEach(walk);
  };
  walk(message.payload);
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from ?? '',
    to: headers.to ?? '',
    subject: headers.subject ?? '',
    messageIdHeader: headers['message-id'] ?? '',
    date: headers.date ?? '',
    snippet: message.snippet ?? '',
    text: texts.join('\n').slice(0, 8000),
    labelIds: message.labelIds ?? [],
  };
}

export function createGmail({ clientId, clientSecret, refreshToken, fetchImpl = fetch, now = () => new Date() }) {
  let token = null;
  let expiresAt = 0;

  async function accessToken() {
    if (token && now().getTime() < expiresAt - 60_000) return token;
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Google sign-in refresh failed: ${data.error ?? response.status}. Run npm run os:google-auth again.`);
    token = data.access_token;
    expiresAt = now().getTime() + (data.expires_in ?? 3600) * 1000;
    return token;
  }

  async function call(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gmail ${method} ${path.split('?')[0]} failed: ${response.status} ${data.error?.message ?? ''}`.trim());
    return data;
  }

  async function messageIdHeader(id) {
    return parseMessage(await call(`/messages/${id}?format=metadata&metadataHeaders=Message-ID`)).messageIdHeader;
  }

  const rawMessage = (mime) => ({ raw: buildMime(mime), ...(mime.threadId ? { threadId: mime.threadId } : {}) });

  return {
    async send(mime) {
      const { id, threadId } = await call('/messages/send', { method: 'POST', body: rawMessage(mime) });
      return { id, threadId, messageIdHeader: await messageIdHeader(id) };
    },
    async createDraft(mime) {
      const draft = await call('/drafts', { method: 'POST', body: { message: rawMessage(mime) } });
      return { id: draft.message.id, draftId: draft.id, threadId: draft.message.threadId, messageIdHeader: await messageIdHeader(draft.message.id) };
    },
    async search(query, max = 50) {
      const data = await call(`/messages?q=${encodeURIComponent(query)}&maxResults=${max}`);
      // Thread IDs come back with the list, so callers can skip mail that isn't theirs without opening it.
      return (data.messages ?? []).map((message) => ({ id: message.id, threadId: message.threadId }));
    },
    async getMessage(id) {
      return parseMessage(await call(`/messages/${id}?format=full`));
    },
    async thread(threadId) {
      const data = await call(`/threads/${threadId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=From`);
      return { id: data.id, messages: (data.messages ?? []).map(parseMessage) };
    },
  };
}
