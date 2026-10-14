// lib/os/portfolio/matcher.js
// Picks the 2-3 pieces most likely to make a prospect reply: same lane first, then style, then place, then recency.
const YEAR_MS = 365 * 24 * 3600 * 1000;
const STOP_WORDS = new Set(['the', 'and', 'county', 'california', 'valley', 'usa', 'french',
  'san', 'santa', 'los', 'las', 'lake', 'bay', 'beach', 'north', 'south', 'east', 'west', 'new', 'city', 'island', 'islands',
  'port', 'palm', 'mount', 'saint', 'area', 'coast']);

function places(text) {
  return new Set(String(text ?? '').toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

export function scorePiece(item, want, now) {
  let score = 0;
  const reasons = [];
  if (want.lane && item.lane === want.lane) {
    score += 5;
    reasons.push('same lane');
  }
  if (want.style && item.style === want.style) {
    score += 3;
    reasons.push(`${item.style} style`);
  }
  const wanted = places(want.location);
  const have = places(item.location);
  if ([...wanted].some((word) => have.has(word))) {
    score += 2;
    reasons.push('same area');
  }
  const published = Date.parse(item.publishedAt);
  const age = Number.isNaN(published) ? 3 * YEAR_MS : Math.max(0, now - published);
  score += Math.max(0, 1 - age / (3 * YEAR_MS));
  if (item.tagsConfirmed) score += 0.5;
  return { score, reasons };
}

export function matchPortfolio(items, want = {}, { limit = 3, now = Date.now() } = {}) {
  return items
    .filter((item) => item.active)
    .map((item) => ({ item, ...scorePiece(item, want, now) }))
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id)
    .slice(0, limit);
}
