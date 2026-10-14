export const DEFAULT_SETTINGS = Object.freeze({
  'os.paused': false,
  'budget.monthly_cap_cents': 15000,
  'budget.warning_cents': 10000,
  'budget.daily_tool_caps': { scrapecreators: 20 },
  'models.prices': {
    'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
    'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    'deepseek-flash': { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0.3 },
    'deepseek-v4-pro': { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 1.32 },
    'grok-4.3': { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 1.25 },
  },
  'budget.search_cost_micros_per_source': 10_000,
  'models.unknown_price': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'telegram.quiet_hours': { start: 21, end: 7 },
  'telegram.bundle_hours': [9, 13, 17],
  'telegram.update_offset': 0,
  'telegram.pending_edits': {},
  'team.members': [],
  'team.requests': [],
  'telegram.last_bundle': '',
  'executor.retry_minutes': [1, 5, 15, 60],
  'heartbeat.last_ping_at': '',
  'backup.last_date': '',
  'gigs.lanes': {
    travel: {
      active: true,
      label: 'Yacht, travel and tourism',
      timezone: 'Pacific/Tahiti',
      queries: [
        'Yacht charter companies operating in French Polynesia (Tahiti, Bora Bora, Raiatea, Moorea)',
        'Luxury resorts and overwater-bungalow hotels in Bora Bora, Moorea and Tahiti',
        'Cruise, sailing and expedition operators in French Polynesia',
        'Superyacht charter brokers with yachts cruising French Polynesia',
      ],
    },
    winery: {
      active: true,
      label: 'Wineries',
      timezone: 'America/Los_Angeles',
      queries: [
        'Napa Valley wineries that host weddings or private events',
        'Sonoma County wineries with event venues',
        'Marin County and West Marin wineries and tasting rooms',
        'Napa and Sonoma wineries with wine clubs and release events',
      ],
    },
    wedding: {
      active: true,
      label: 'Weddings and events',
      timezone: 'America/Los_Angeles',
      queries: [
        'Wedding venues in Marin County, California',
        'Luxury wedding planners serving Marin, Napa and Sonoma',
        'Estate and vineyard wedding venues in Napa and Sonoma',
      ],
    },
    real_estate: {
      active: true,
      label: 'Real estate',
      timezone: 'America/Los_Angeles',
      queries: [
        'Luxury real estate agents in Marin County with current listings',
        'Top listing agents in Mill Valley, Tiburon, Ross and Sausalito',
        'Real estate agents with luxury listings in Napa and Sonoma',
      ],
    },
  },
  'gigs.query_cursor': {},
  'gigs.daily_searches': 3,
  'gigs.daily_research': 12,
  'gigs.research_today': { date: '', count: 0 },
  'gigs.last_runs': {},
  'outreach.mode': 'draft',
  'outreach.sender_name': 'Jack Riggs',
  'outreach.daily_pitch_limit': 15,
  'outreach.daily_email_limit': 40,
  'outreach.follow_up_days': [4, 9],
  'outreach.close_after_days': 7,
  'outreach.window': { startHour: 9, endHour: 17 },
  'outreach.paused_lanes': {},
  'portfolio.site_url': 'https://madebyotg.com',
  'portfolio.instagram_handle': 'madebyotg',
  'budget.scrapecreators_credit_micros': 2_000,
  'gmail.last_poll_at': '',
});

export function createSettings({ db }) {
  const read = db.prepare('SELECT value FROM settings WHERE key = ?');
  const write = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);

  function assertKnown(key) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key)) throw new Error(`Unknown setting: ${key}`);
  }

  function get(key) {
    assertKnown(key);
    const row = read.get(key);
    return row ? JSON.parse(row.value) : structuredClone(DEFAULT_SETTINGS[key]);
  }

  function set(key, value) {
    assertKnown(key);
    write.run(key, JSON.stringify(value), new Date().toISOString());
    return value;
  }

  return { get, set };
}
