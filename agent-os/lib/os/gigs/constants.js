export const LANES = ['travel', 'winery', 'wedding', 'real_estate'];

export const LANE_LABELS = {
  travel: 'yacht, travel and tourism',
  winery: 'winery',
  wedding: 'wedding and event',
  real_estate: 'real estate',
};

export const STYLES = ['cinematic', 'documentary', 'editorial', 'energetic', 'aerial', 'lifestyle'];

export const DELIVERABLES = ['film', 'reel', 'photo_set', 'drone'];

// Hosts where many separate businesses share one domain (brokerages, site builders, link pages).
// Businesses on them are told apart by page path, and the domain is never suppressed as a whole.
export const SHARED_HOSTS = [
  'sothebysrealty.com', 'bhhs.com', 'kw.com', 'coldwellbanker.com', 'corcoran.com', 'compass.com', 'elliman.com',
  'christiesrealestate.com', 'wixsite.com', 'squarespace.com', 'godaddysites.com', 'square.site', 'linktr.ee', 'carrd.co',
];

export const STAGES = [
  'found', 'researched', 'pitched', 'following_up', 'replied', 'portfolio_sent', 'quoted', 'held', 'booked',
  'closed_no', 'closed_not_now', 'closed_unsubscribed', 'closed_below_minimum', 'closed_bounced',
  'closed_hold_expired', 'closed_lost',
];

export const OPEN_STAGES = STAGES.filter((stage) => !stage.startsWith('closed_') && stage !== 'booked');
