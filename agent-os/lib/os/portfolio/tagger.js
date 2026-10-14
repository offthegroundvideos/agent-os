// lib/os/portfolio/tagger.js
import { extractJson } from '../json.js';
import { DELIVERABLES, LANES, STYLES } from '../gigs/constants.js';

export const TAG_LANES = [...LANES, 'other'];

export const TAGGER_SYSTEM = `You tag portfolio pieces for OFF THE GROUND, a photo and video production company in Fairfax, California.
Reply with only a JSON object: {"lane": one of ${TAG_LANES.join(', ')}, "style": one of ${STYLES.join(', ')}, "location": a short place name or "", "deliverable_type": one of ${DELIVERABLES.join(', ')}}.
Lanes: travel = yachts, resorts, tourism, destinations. winery = wineries and vineyards. wedding = weddings and private events. real_estate = property listings. other = anything else (sports, music, brands, portraits).`;

export function normalizeTags(raw, fallbackDeliverable = '') {
  return {
    lane: TAG_LANES.includes(raw?.lane) ? raw.lane : 'other',
    style: STYLES.includes(raw?.style) ? raw.style : '',
    location: String(raw?.location ?? '').slice(0, 80),
    deliverableType: DELIVERABLES.includes(raw?.deliverable_type) ? raw.deliverable_type : fallbackDeliverable,
  };
}

// Portfolio pieces are public, so tagging can use the free/cheap bulk route.
export async function suggestTags(router, item) {
  const result = await router.run('bulk', {
    system: TAGGER_SYSTEM,
    messages: [{ role: 'user', content: `Title: ${item.title}\nDescription: ${item.description}\nLink: ${item.url}` }],
    maxTokens: 300,
  });
  return normalizeTags(extractJson(result.text), item.deliverableType);
}
