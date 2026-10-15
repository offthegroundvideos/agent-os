// lib/os/gigs/prospectFinder.js
import { extractJson } from '../json.js';
import { domainOf } from './store.js';

// Directories, marketplaces, listing portals and social sites: never a business's own site, and some forbid scraping.
export const SKIP_DOMAINS = [
  'zillow.com', 'redfin.com', 'realtor.com', 'trulia.com', 'homes.com', 'yelp.com', 'tripadvisor.com',
  'theknot.com', 'weddingwire.com', 'zola.com', 'instagram.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'wikipedia.org', 'google.com', 'booking.com', 'expedia.com', 'airbnb.com',
  'yachtcharterfleet.com', 'charterworld.com', 'yachtworld.com',
];

const CONVERT_SYSTEM = 'Convert the text into a JSON array of businesses: [{"name": "...", "website": "...", "location": "...", "fit_reason": "..."}]. Only include businesses with a website. Reply with only the JSON array.';

export function finderQuery(query) {
  return `${query}. Find up to 8 specific, currently operating businesses. Reply with only a JSON array, no prose: `
    + '[{"name": "...", "website": "official website URL", "location": "town, region", "fit_reason": "one sentence on why they might hire a photo and video production company"}]. '
    + "Use each business's own official website, not a directory, marketplace or social media page.";
}

export function parseCandidates(answer) {
  let list;
  try {
    list = extractJson(answer);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) list = Array.isArray(list?.businesses) ? list.businesses : [];
  return list
    .filter((candidate) => candidate?.name && candidate?.website)
    .map((candidate) => ({
      name: String(candidate.name).slice(0, 120),
      website: String(candidate.website),
      location: String(candidate.location ?? '').slice(0, 120),
      fitReason: String(candidate.fit_reason ?? candidate.fitReason ?? '').slice(0, 300),
    }));
}

const isSkipDomain = (domain) => SKIP_DOMAINS.some((skip) => domain === skip || domain.endsWith(`.${skip}`));

export function createProspectFinder({ liveSearch, router, store, settings }) {
  function nextQuery(lane) {
    const queries = settings.get('gigs.lanes')[lane]?.queries ?? [];
    if (!queries.length) return null;
    const cursor = settings.get('gigs.query_cursor');
    const index = (cursor[lane] ?? 0) % queries.length;
    settings.set('gigs.query_cursor', { ...cursor, [lane]: index + 1 });
    return queries[index];
  }

  async function findForLane(lane) {
    const config = settings.get('gigs.lanes')[lane];
    if (!config?.active) return { lane, skipped: 'lane inactive' };
    const query = nextQuery(lane);
    if (!query) return { lane, skipped: 'no search queries for this lane' };
    const result = await liveSearch.search({ query: finderQuery(query), sources: 'web' });
    if (result.error) return { lane, query, skipped: result.error };
    let candidates = parseCandidates(result.answer);
    if (!candidates.length && result.answer) {
      const converted = await router.run('bulk', { system: CONVERT_SYSTEM, messages: [{ role: 'user', content: result.answer }], maxTokens: 1500 });
      candidates = parseCandidates(converted.text);
    }
    const created = [];
    const skipped = [];
    for (const candidate of candidates) {
      const domain = domainOf(candidate.website);
      if (!domain || isSkipDomain(domain)) {
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
    }
    return { lane, query, created, skipped, costMicros: result.costMicros ?? 0 };
  }

  return { findForLane, nextQuery };
}
