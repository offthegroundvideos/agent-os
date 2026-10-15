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

const blank = (value) => value === undefined || value === null || String(value).trim() === '';

export function buildMime({ from, to, subject, text, inReplyTo = '', references = '' }) {
  // A line break in a header value would let a prospect's reply or a model draft smuggle in extra headers (Bcc, etc).
  for (const [field, value] of Object.entries({ from, to, subject, inReplyTo, references })) {
    if (value !== undefined && value !== null && /[\r\n\0]/.test(String(value))) throw new Error(`Invalid ${field}: line break in header value`);
  }
  for (const [field, value] of Object.entries({ to, subject, text })) {
    if (blank(value)) throw new Error(`Invalid ${field}: missing`);
  }
  const normalized = String(text).replace(/\r\n|\r|\n/g, '\r\n');
  // Plain ASCII goes out as 7bit, which spam filters like better than base64 for short business mail.
  const ascii = /^[\x00-\x7f]*$/.test(normalized);
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(String(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    `Content-Transfer-Encoding: ${ascii ? '7bit' : 'base64'}`,
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`, `References: ${references || inReplyTo}`);
  const body = ascii ? normalized : Buffer.from(normalized, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf8').toString('base64url');
}

function decodePart(part) {
  const contentType = (part.headers ?? []).find((header) => header.name?.toLowerCase() === 'content-type')?.value ?? '';
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  const bytes = Buffer.from(part.body.data, 'base64url');
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function htmlToText(html) {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseMessage(message) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const plain = [];
  const html = [];
  const walk = (part) => {
    if (!part) return;
    // Attachments (including text ones) are not the reply itself.
    if (!part.filename) {
      if (part.mimeType === 'text/plain' && part.body?.data) plain.push(decodePart(part));
      else if (part.mimeType === 'text/html' && part.body?.data) html.push(decodePart(part));
    }
    (part.parts ?? []).forEach(walk);
  };
  walk(message.payload);
  const snippet = message.snippet ?? '';
  const text = plain.length ? plain.join('\n') : (html.length ? htmlToText(html.join('\n')) : '') || snippet;
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from ?? '',
    to: headers.to ?? '',
    subject: headers.subject ?? '',
    messageIdHeader: headers['message-id'] ?? '',
    date: headers.date ?? '',
    snippet,
    text: text.slice(0, 8000),
    labelIds: message.labelIds ?? [],
  };
}

export function createGmail({ clientId, clientSecret, refreshToken, fetchImpl = fetch, now = () => new Date() }) {
  let token = null;
  let expiresAt = 0;
  let refreshing = null;

  async function refresh() {
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google sign-in refresh failed: ${data.error ?? response.status}. Run npm run os:google-auth again.`);
    token = data.access_token;
    expiresAt = now().getTime() + (data.expires_in ?? 3600) * 1000;
    return token;
  }

  async function accessToken() {
    if (token && now().getTime() < expiresAt - 60_000) return token;
    // Parallel callers on a cold cache share one refresh instead of each hitting Google.
    refreshing ??= refresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function call(path, { method = 'GET', body } = {}) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(`${API}${path}`, {
        method,
        headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 401 && attempt === 0) {
        token = null;
        expiresAt = 0;
        continue;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Gmail ${method} ${path.split('?')[0]} failed: ${response.status} ${data.error?.message ?? ''}`.trim());
      return data;
    }
  }

  // The mail is already sent or drafted by the time this runs, so a failed lookup must not look like a failed send.
  async function lookupMessageIdHeader(id) {
    try {
      return parseMessage(await call(`/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Message-ID`)).messageIdHeader;
    } catch {
      return '';
    }
  }

  const rawMessage = (mime) => ({ raw: buildMime(mime), ...(mime.threadId ? { threadId: mime.threadId } : {}) });

  return {
    async send(mime) {
      const { id, threadId } = await call('/messages/send', { method: 'POST', body: rawMessage(mime) });
      return { id, threadId, messageIdHeader: await lookupMessageIdHeader(id) };
    },
    async createDraft(mime) {
      const draft = await call('/drafts', { method: 'POST', body: { message: rawMessage(mime) } });
      return { id: draft.message.id, draftId: draft.id, threadId: draft.message.threadId, messageIdHeader: await lookupMessageIdHeader(draft.message.id) };
    },
    // Follows nextPageToken (newest first) until `max` results are collected or Gmail has no more.
    async search(query, max = 50) {
      const found = [];
      let pageToken = '';
      while (found.length < max) {
        const size = Math.min(500, max - found.length);
        const data = await call(`/messages?q=${encodeURIComponent(query)}&maxResults=${size}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
        // Thread IDs come back with the list, so callers can skip mail that isn't theirs without opening it.
        for (const message of data.messages ?? []) found.push({ id: message.id, threadId: message.threadId });
        pageToken = data.nextPageToken ?? '';
        if (!pageToken) break;
      }
      return found.slice(0, max);
    },
    async getMessage(id) {
      return parseMessage(await call(`/messages/${encodeURIComponent(id)}?format=full`));
    },
    async thread(threadId) {
      const data = await call(`/threads/${encodeURIComponent(threadId)}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=References`);
      return { id: data.id, messages: (data.messages ?? []).map(parseMessage) };
    },
  };
}
