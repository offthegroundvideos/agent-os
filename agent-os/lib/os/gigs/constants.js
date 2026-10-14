export const LANES = ['travel', 'winery', 'wedding', 'real_estate'];

export const LANE_LABELS = {
  travel: 'yacht, travel and tourism',
  winery: 'winery',
  wedding: 'wedding and event',
  real_estate: 'real estate',
};

export const STYLES = ['cinematic', 'documentary', 'editorial', 'energetic', 'aerial', 'lifestyle'];

export const DELIVERABLES = ['film', 'reel', 'photo_set', 'drone'];

export const STAGES = [
  'found', 'researched', 'pitched', 'following_up', 'replied', 'portfolio_sent', 'quoted', 'held', 'booked',
  'closed_no', 'closed_not_now', 'closed_unsubscribed', 'closed_below_minimum', 'closed_bounced',
  'closed_hold_expired', 'closed_lost',
];

export const OPEN_STAGES = STAGES.filter((stage) => !stage.startsWith('closed_') && stage !== 'booked');
