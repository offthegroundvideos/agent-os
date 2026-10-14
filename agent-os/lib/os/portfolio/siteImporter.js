// lib/os/portfolio/siteImporter.js
// Reads the portfolio from madebyotg.com: /work/ links to one page per piece, each with og: tags and JSON-LD.
const UA = 'Mozilla/5.0 (compatible; OTG-OS/1.0; +https://madebyotg.com)';

const NAMED_ENTITIES = {
  quot: '"', lt: '<', gt: '>', nbsp: ' ', eacute: 'é', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', ndash: '–', mdash: '—',
};

function codePoint(value, radix) {
  try {
    return String.fromCodePoint(Number.parseInt(value, radix));
  } catch {
    return '';
  }
}

// &amp; is decoded last so "&amp;quot;" becomes "&quot;", not a double quote.
function decode(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => codePoint(hex, 16))
    .replace(/&#(\d+);/g, (_, dec) => codePoint(dec, 10))
    .replace(/&([a-z]+);/gi, (whole, name) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/&amp;/g, '&')
    .trim();
}

function meta(html, key) {
  const before = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=(["'])(.*?)\\1`, 'i');
  const after = new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]*(?:property|name)=["']${key}["']`, 'i');
  const match = html.match(before) ?? html.match(after);
  return match ? decode(match[2]) : '';
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

function absolute(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

export function parseWorkIndex(html, siteUrl) {
  const urls = new Set();
  for (const match of String(html).matchAll(/href=(["'])([^"'#?]+)\1/g)) {
    let url;
    try {
      url = new URL(match[2], siteUrl);
    } catch {
      continue;
    }
    if (url.host !== new URL(siteUrl).host || !/^\/work\/[^/]+\/?$/.test(url.pathname)) continue;
    if (url.pathname.split('/').filter(Boolean).pop().includes('.')) continue;
    urls.add(url.href.endsWith('/') ? url.href : `${url.href}/`);
  }
  return [...urls];
}

export function parseWorkPage(html, url) {
  const nodes = jsonLdNodes(html);
  const media = nodes.find((node) => node?.['@type'] === 'VideoObject')
    ?? nodes.find((node) => ['ImageObject', 'ImageGallery', 'CreativeWork'].includes(node?.['@type']));
  const pageTitle = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]).split(' — ')[0];
  return {
    source: 'site',
    url,
    title: meta(html, 'og:title') || pageTitle || url,
    description: meta(html, 'og:description') || meta(html, 'description'),
    thumbnailUrl: absolute(meta(html, 'og:image') || media?.thumbnailUrl || '', url),
    publishedAt: media?.uploadDate || media?.datePublished || '',
    deliverableType: media?.['@type'] === 'VideoObject' ? 'film' : media ? 'photo_set' : '',
  };
}

export async function importSite({ siteUrl, fetchImpl = fetch, timeoutMs = 20_000 }) {
  async function get(url) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new Error(`${url} failed: ${error.cause?.code ?? error.message}`);
    }
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
