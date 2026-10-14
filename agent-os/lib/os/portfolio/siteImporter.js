// lib/os/portfolio/siteImporter.js
// Reads the portfolio from madebyotg.com: /work/ links to one page per piece, each with og: tags and JSON-LD.
const UA = 'Mozilla/5.0 (compatible; OTG-OS/1.0; +https://madebyotg.com)';

function decode(text) {
  return String(text ?? '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .trim();
}

function meta(html, key) {
  const before = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i');
  const after = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
  const match = html.match(before) ?? html.match(after);
  return match ? decode(match[1]) : '';
}

function jsonLdNodes(html) {
  const nodes = [];
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(block[1]);
      for (const node of [data, ...(Array.isArray(data['@graph']) ? data['@graph'] : [])]) nodes.push(node);
    } catch {
      // A broken JSON-LD block just means less metadata.
    }
  }
  return nodes;
}

export function parseWorkIndex(html, siteUrl) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href="([^"#?]+)"/g)) {
    let url;
    try {
      url = new URL(match[1], siteUrl);
    } catch {
      continue;
    }
    if (url.host !== new URL(siteUrl).host || !/^\/work\/[^/]+\/?$/.test(url.pathname)) continue;
    urls.add(url.href.endsWith('/') ? url.href : `${url.href}/`);
  }
  return [...urls];
}

export function parseWorkPage(html, url) {
  const nodes = jsonLdNodes(html);
  const media = nodes.find((node) => ['VideoObject', 'ImageObject', 'ImageGallery', 'CreativeWork'].includes(node?.['@type']));
  const pageTitle = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]).split(' — ')[0];
  return {
    source: 'site',
    url,
    title: meta(html, 'og:title') || pageTitle || url,
    description: meta(html, 'og:description') || meta(html, 'description'),
    thumbnailUrl: meta(html, 'og:image') || media?.thumbnailUrl || '',
    publishedAt: media?.uploadDate || media?.datePublished || '',
    deliverableType: media?.['@type'] === 'VideoObject' ? 'film' : media ? 'photo_set' : '',
  };
}

export async function importSite({ siteUrl, fetchImpl = fetch, timeoutMs = 20_000 }) {
  async function get(url) {
    const response = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.text();
  }
  const urls = parseWorkIndex(await get(new URL('/work/', siteUrl).href), siteUrl);
  const items = [];
  const errors = [];
  for (const url of urls) {
    try {
      items.push(parseWorkPage(await get(url), url));
    } catch (error) {
      errors.push(error.message);
    }
  }
  return { items, errors };
}
