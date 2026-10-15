// lib/os/gigs/siteFetch.js
// Reads a prospect's own public website, politely: robots.txt first, then the homepage and up to 3 relevant pages.
// Everything here runs in linear time on hostile input: no nested quantifiers, tag scanning uses indexOf.
const UA = 'Mozilla/5.0 (compatible; OTG-OS/1.0; +https://madebyotg.com)';
const EMAIL = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_ONLY = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const JUNK_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|godaddy|domain|email)\.|^(noreply|no-reply|donotreply)@/i;
const RELEVANT = /contact|about|events?|weddings?|private|team|agents?|connect|charters?|enquir|inquir/i;
const PRIORITY = /contact|enquir|inquir/i;
const PAGE_EXTENSIONS = new Set(['html', 'htm', 'php', 'aspx']);
const AT_ENTITY = /&#64;|&#x40;|&commat;/gi;

function asciiLower(text) {
  return text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

// Removes <tag ...> ... </tag> blocks with indexOf scans; an unclosed block drops the rest of the page.
function stripBlocks(html, tag) {
  const lower = asciiLower(html);
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let out = '';
  let pos = 0;
  for (;;) {
    const start = lower.indexOf(open, pos);
    if (start < 0) break;
    out += `${html.slice(pos, start)} `;
    const end = lower.indexOf(close, start);
    if (end < 0) return out;
    pos = end + close.length;
  }
  return out + html.slice(pos);
}

export function htmlToText(html) {
  return stripBlocks(stripBlocks(String(html), 'script'), 'style')
    .replace(/<[^<>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(AT_ENTITY, '@')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEmails(html, sourceUrl) {
  const found = new Map();
  const add = (raw) => {
    const email = String(raw).trim().toLowerCase().replace(/\.$/, '');
    if (EMAIL_ONLY.test(email) && !JUNK_EMAIL.test(email) && !found.has(email)) found.set(email, { email, sourceUrl });
  };
  for (const match of String(html).matchAll(/mailto:([^"'>\s]+)/gi)) {
    let value;
    try {
      value = decodeURIComponent(match[1].replace(AT_ENTITY, '@'));
    } catch {
      continue;
    }
    const query = value.indexOf('?');
    if (query >= 0) value = value.slice(0, query);
    for (const piece of value.split(/[,;&]/)) add(piece);
  }
  for (const match of htmlToText(html).matchAll(EMAIL)) add(match[0]);
  return [...found.values()];
}

function hostKey(url) {
  return url.host.replace(/^www\./i, '').toLowerCase();
}

function hasPageExtension(url) {
  const last = url.pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot < 0 || PAGE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

export function candidateLinks(html, baseUrl, max = 3) {
  const source = String(html);
  const lower = asciiLower(source);
  const base = new URL(baseUrl);
  const baseHref = `${base.origin}${base.pathname}${base.search}`;
  const seen = new Set();
  const found = [];
  let pos = 0;
  for (;;) {
    const start = lower.indexOf('<a', pos);
    if (start < 0) break;
    pos = start + 2;
    if (!/[\s>]/.test(lower[pos] ?? '')) continue;
    const tagEnd = source.indexOf('>', pos);
    if (tagEnd < 0) break;
    pos = tagEnd + 1;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(source.slice(start, tagEnd));
    const target = href ? (href[1] ?? href[2]) : '';
    if (!target) continue;
    let url;
    try {
      url = new URL(target, base);
    } catch {
      continue;
    }
    url.hash = '';
    if (!/^https?:$/.test(url.protocol) || hostKey(url) !== hostKey(base) || !hasPageExtension(url)) continue;
    if (`${url.origin}${url.pathname}${url.search}` === baseHref || seen.has(url.href)) continue;
    const snippet = source.slice(pos, pos + 300);
    const close = asciiLower(snippet).indexOf('</a');
    const text = htmlToText(close >= 0 ? snippet.slice(0, close) : snippet);
    if (!RELEVANT.test(url.pathname) && !RELEVANT.test(text)) continue;
    seen.add(url.href);
    found.push({ href: url.href, first: PRIORITY.test(url.pathname) || PRIORITY.test(text) });
  }
  return [...found.filter((l) => l.first), ...found.filter((l) => !l.first)].slice(0, max).map((l) => l.href);
}

// Applies the "User-agent: *" group only; an empty Disallow allows everything.
// The longest matching Allow/Disallow prefix wins, and a tie goes to Allow.
export function robotsAllows(robotsTxt, path) {
  let applies = false;
  let inAgents = false;
  const rules = [];
  for (const rawLine of String(robotsTxt ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (!key) continue;
    if (/^user-agent$/i.test(key)) {
      if (!inAgents) applies = false;
      inAgents = true;
      if (value === '*') applies = true;
    } else {
      inAgents = false;
      if (applies && value && /^(allow|disallow)$/i.test(key)) rules.push({ allow: /^allow$/i.test(key), value });
    }
  }
  let best = null;
  for (const rule of rules) {
    if (!path.startsWith(rule.value)) continue;
    if (!best || rule.value.length > best.value.length || (rule.value.length === best.value.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export function createSiteFetch({ fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  async function get(url) {
    const response = await fetchImpl(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error(`${url} is not a web page`);
    return { html: (await response.text()).slice(0, 500_000), url: response.url || url };
  }

  async function fetchSite(website) {
    const home = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    if (isPrivateHost(home.hostname)) throw new Error('Refusing to read a private address.');
    home.pathname = home.pathname || '/';
    let robots = '';
    try {
      const response = await fetchImpl(new URL('/robots.txt', home).href, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status >= 500) return { pages: [], emails: [], blocked: true };
      if (response.ok) robots = await response.text();
    } catch {
      // No robots.txt means no rules.
    }
    const pages = [];
    const emails = new Map();
    const visit = async (url) => {
      if (!robotsAllows(robots, new URL(url).pathname)) return null;
      const page = await get(url);
      if (hostKey(new URL(page.url)) !== hostKey(home)) return { offSite: page.url };
      pages.push({ url: page.url, text: htmlToText(page.html).slice(0, 6000) });
      for (const entry of extractEmails(page.html, page.url)) if (!emails.has(entry.email)) emails.set(entry.email, entry);
      return page;
    };
    const homePage = await visit(home.href);
    if (homePage?.offSite) return { pages: [], emails: [], blocked: false, offSite: homePage.offSite };
    if (homePage) {
      for (const link of candidateLinks(homePage.html, homePage.url)) {
        try {
          await visit(link);
        } catch {
          // One broken subpage doesn't stop the research.
        }
      }
    }
    return { pages, emails: [...emails.values()], blocked: homePage === null };
  }

  return { fetchSite };
}
