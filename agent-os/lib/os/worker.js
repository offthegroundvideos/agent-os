import { isQuietHour, pacificDateKey, pacificParts } from './time.js';

export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const BACKUP_HOUR = 3;

export function createWorker({ settings, registry, heartbeat, backup }, { now = () => new Date(), log = console.error } = {}) {
  async function maybeFlushApprovals(date) {
    const { hour } = pacificParts(date);
    if (!settings.get('telegram.bundle_hours').includes(hour)) return 0;
    if (isQuietHour(date, settings.get('telegram.quiet_hours'))) return 0;
    const key = `${pacificDateKey(date)}-${hour}`;
    if (settings.get('telegram.last_bundle') === key) return 0;
    settings.set('telegram.last_bundle', key);
    return registry.flushPendingApprovals();
  }

  async function maybeHeartbeat(date) {
    const last = settings.get('heartbeat.last_ping_at');
    if (last && date.getTime() - Date.parse(last) < HEARTBEAT_INTERVAL_MS) return false;
    settings.set('heartbeat.last_ping_at', date.toISOString());
    return heartbeat.ping(settings.get('os.paused') ? 'paused' : 'ok');
  }

  function maybeBackup(date) {
    const today = pacificDateKey(date);
    if (pacificParts(date).hour < BACKUP_HOUR || settings.get('backup.last_date') === today) return null;
    const file = backup.run();
    settings.set('backup.last_date', today);
    return file;
  }

  async function safely(name, fn, fallback) {
    try {
      return await fn();
    } catch (error) {
      log(`${name} failed: ${error?.message ?? error}`);
      return fallback;
    }
  }

  async function tick() {
    const date = now();
    return {
      executed: await safely('execute', async () => (await registry.executeDue()).executed, 0),
      flushed: await safely('approval bundle', () => maybeFlushApprovals(date), 0),
      heartbeat: await safely('heartbeat', () => maybeHeartbeat(date), false),
      backup: await safely('backup', () => maybeBackup(date), null),
    };
  }

  return { tick, maybeFlushApprovals, maybeHeartbeat, maybeBackup };
}
