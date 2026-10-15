// lib/os/gigs/prospectFinder.js
import { extractJsonCandidates } from '../json.js';
import { domainOf } from './store.js';

// Directories, marketplaces, listing portals and social sites: never a business's own site, and some forbid scraping.
export const SKIP_DOMAINS = [
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com', 'homes.com', 'yelp.com', 'tripadvisor.com',
  'theknot.com', 'weddingwire.com', 'zola.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'wikipedia.org', 'google.com', 'booking.com', 'expedia.com', 'airbnb.com',
  'yachtcharterfleet.com', 'charterworld.com', 'yachtworld.com',
  'pinterest.com', 'reddit.com', 'vimeo.com', 'yellowpages.com', 'bbb.org', 'mapquest.com', 'goo.gl', 'g.page', 'fb.com', 'fb.me',
  'youtu.be', 'instagr.am', 't.co', 'thebash.com', 'herecomestheguide.com', 'weddingspot.com', 'eventective.com', 'peerspace.com',
  'vivino.com', 'apartments.com', 'loopnet.com',
];

// Country-TLD variants of the big portals (tripadvisor.fr, booking.co.uk, google.com.au ...).
const SKIP_PREFIXES = ['tripadvisor.', 'booking.', 'expedia.', 'airbnb.', 'google.'];

const CONVERT_SYSTEM = 'Convert the text into a JSON array of businesses: [{"name": "...", "website": "...", "location": "...", "fit_reason": "..."}]. Only include businesses with a website. Reply with only the JSON array.';

export function finderQuery(query) {
  return `${query}. Find up to 8 specific, currently operating businesses. Reply with only a JSON array, no prose: `
    + '[{"name": "...", "website": "official website URL", "location": "town, region", "fit_reason": "one sentence on why they might hire a photo and video production company"}]. '
    + "Use each business's own official website, not a directory, marketplace or social media page.";
}

// Grok citation markup: "[[1]](https://source)" and "[1]".
const stripCitations = (text) => String(text ?? '').replace(/\[\[\d+\]\]\([^)]*\)/g, '').replace(/\[\d+\]/g, '');

// A website value as Grok really returns it: markdown links, citations, trailing words, tracking params, fragments.
export function cleanWebsite(raw) {
  let text = stripCitations(raw);
  const link = text.match(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/);
  if (link) [, text] = link;
  text = text.trim().split(/\s+/)[0] ?? '';
  const hash = text.indexOf('#');
  if (hash >= 0) text = text.slice(0, hash);
  const query = text.indexOf('?');
  if (query >= 0) {
    const kept = text.slice(query + 1).split('&').filter((param) => param && !/^(?:utm_[^=]*|gclid|fbclid)(?:=|$)/i.test(param));
    text = text.slice(0, query) + (kept.length ? `?${kept.join('&')}` : '');
  }
  return text;
}

const hasSite = (item) => item?.name && item?.website;

export function parseCandidates(answer) {
  const text = stripCitations(answer);
  let list = [];
  for (const value of extractJsonCandidates(text)) {
    const items = Array.isArray(value) ? value : value?.businesses;
    if (Array.isArray(items) && items.some(hasSite)) {
      list = items;
      break;
    }
  }
  return list
    .filter(hasSite)
    .map((candidate) => ({
      name: String(candidate.name).slice(0, 120),
      website: cleanWebsite(candidate.website),
      location: String(candidate.location ?? '').slice(0, 120),
      fitReason: String(candidate.fit_reason ?? candidate.fitReason ?? '').slice(0, 300),
    }));
}

const isSkipDomain = (domain) => SKIP_DOMAINS.some((skip) => domain === skip || domain.endsWith(`.${skip}`))
  || SKIP_PREFIXES.some((prefix) => domain.startsWith(prefix));

export function createProspectFinder({ liveSearch, router, store, settings }) {
  function nextQuery(lane) {
    const queries = settings.get('gigs.lanes')[lane]?.queries ?? [];
    if (!queries.length) return null;
    const cursor = settings.get('gigs.query_cursor');
    const position = Number.isInteger(cursor[lane]) && cursor[lane] >= 0 ? cursor[lane] : 0;
    const index = position % queries.length;
    settings.set('gigs.query_cursor', { ...cursor, [lane]: index + 1 });
    return queries[index] || null;
  }

  // Puts one lane's cursor back, leaving the other lanes' cursors as they are now.
  function restoreCursor(lane, previous) {
    const cursor = { ...settings.get('gigs.query_cursor') };
    if (previous === undefined) delete cursor[lane];
    else cursor[lane] = previous;
    settings.set('gigs.query_cursor', cursor);
  }

  async function findForLane(lane) {
    const config = settings.get('gigs.lanes')[lane];
    if (!config?.active) return { lane, skipped: 'lane inactive' };
    const previous = settings.get('gigs.query_cursor')[lane];
    const query = nextQuery(lane);
    if (!query) return { lane, skipped: 'no search queries for this lane' };
    let result;
    try {
      result = await liveSearch.search({ query: finderQuery(query), sources: 'web' });
    } catch (error) {
      restoreCursor(lane, previous);
      throw error;
    }
    if (result.error) {
      restoreCursor(lane, previous);
      return { lane, query, skipped: result.error };
    }
    const costMicros = result.costMicros ?? 0;
    let candidates = parseCandidates(result.answer);
    if (!candidates.length && result.answer) {
      try {
        const converted = await router.run('bulk', { system: CONVERT_SYSTEM, messages: [{ role: 'user', content: result.answer }], maxTokens: 1500 });
        candidates = parseCandidates(converted.text);
      } catch {
        return { lane, query, created: [], skipped: [], skippedReason: 'bulk conversion failed', costMicros };
      }
    }
    const created = [];
    const skipped = [];
    for (const candidate of candidates) {
      try {
        const domain = domainOf(candidate.website);
        if (!domain) {
          skipped.push({ name: candidate.name, reason: 'unusable website' });
          continue;
        }
        if (isSkipDomain(domain)) {
          skipped.push({ name: candidate.name, reason: 'directory or social site' });
          continue;
        }
        if (store.isSuppressed(domain)) {
          skipped.push({ name: candidate.name, reason: 'on the do-not-contact list' });
          continue;
        }
        const { business, created: isNew } = store.upsertBusiness({ ...candidate, lane, timezone: config.timezone, sourceUrl: result.links?.[0] ?? '' });
        if (!isNew) {
          skipped.push({ name: candidate.name, reason: 'already known' });
          continue;
        }
        const { opportunity } = store.createOpportunity(business.id);
        created.push({ name: business.name, opportunityId: opportunity.id });
      } catch (error) {
        skipped.push({ name: candidate.name, reason: `error: ${error.message}` });
      }
    }
    return { lane, query, created, skipped, costMicros };
  }

  return { findForLane, nextQuery };
}
