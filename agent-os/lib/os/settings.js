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
  'telegram.pending_edit_action_id': '',
  'telegram.last_bundle': '',
  'executor.retry_minutes': [1, 5, 15, 60],
  'heartbeat.last_ping_at': '',
  'backup.last_date': '',
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
