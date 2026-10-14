// lib/os/gigs/siteFetch.js
// Reads a prospect's own public website, politely: robots.txt first, then the homepage and up to 3 relevant pages.
const UA = 'Mozilla/5.0 (compatible; OTG-OS/1.0; +https://madebyotg.com)';
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JUNK_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|godaddy|domain|email)\.|^(noreply|no-reply|donotreply)@/i;
const RELEVANT = /contact|about|events?|weddings?|private|team|agents?|connect|charters?|enquir|inquir/i;

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#64;|&commat;/g, '@')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractEmails(html, sourceUrl) {
  const found = new Map();
  const add = (raw) => {
    const email = String(raw).trim().toLowerCase().replace(/\.$/, '');
    if (!JUNK_EMAIL.test(email) && !found.has(email)) found.set(email, { email, sourceUrl });
  };
  for (const match of String(html).matchAll(/mailto:([^"'?>\s]+)/gi)) add(decodeURIComponent(match[1]));
  for (const match of htmlToText(html).matchAll(EMAIL)) add(match[0]);
  return [...found.values()];
}

export function candidateLinks(html, baseUrl, max = 3) {
  const base = new URL(baseUrl);
  const links = [];
  for (const match of String(html).matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try {
      url = new URL(match[1], base);
    } catch {
      continue;
    }
    if (url.host !== base.host || url.href === base.href || links.includes(url.href)) continue;
    if (RELEVANT.test(url.pathname) || RELEVANT.test(htmlToText(match[2]))) links.push(url.href);
    if (links.length >= max) break;
  }
  return links;
}

// Applies the "User-agent: *" group only; an empty Disallow allows everything.
export function robotsAllows(robotsTxt, path) {
  let applies = false;
  let inAgents = false;
  const disallowed = [];
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
      if (applies && /^disallow$/i.test(key) && value) disallowed.push(value);
    }
  }
  return !disallowed.some((prefix) => path.startsWith(prefix));
}

export function createSiteFetch({ fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  async function get(url) {
    const response = await fetchImpl(url, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error(`${url} is not a web page`);
    return (await response.text()).slice(0, 500_000);
  }

  async function fetchSite(website) {
    const home = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    home.pathname = home.pathname || '/';
    let robots = '';
    try {
      const response = await fetchImpl(new URL('/robots.txt', home).href, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) robots = await response.text();
    } catch {
      // No robots.txt means no rules.
    }
    const pages = [];
    const emails = new Map();
    const visit = async (url) => {
      if (!robotsAllows(robots, new URL(url).pathname)) return null;
      const html = await get(url);
      pages.push({ url, text: htmlToText(html).slice(0, 6000) });
      for (const entry of extractEmails(html, url)) if (!emails.has(entry.email)) emails.set(entry.email, entry);
      return html;
    };
    const homeHtml = await visit(home.href);
    if (homeHtml) {
      for (const link of candidateLinks(homeHtml, home.href)) {
        try {
          await visit(link);
        } catch {
          // One broken subpage doesn't stop the research.
        }
      }
    }
    return { pages, emails: [...emails.values()], blocked: homeHtml === null };
  }

  return { fetchSite };
}
