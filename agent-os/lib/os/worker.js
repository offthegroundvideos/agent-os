import { isQuietHour, pacificDateKey, pacificParts } from './time.js';

export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const BACKUP_HOUR = 3;

export function createWorker({ settings, registry, heartbeat, backup, weekly = null, brief = null, notifier = null }, { now = () => new Date(), log = console.error } = {}) {
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

  // Sunday evening: the weekly money report goes to Telegram (quiet hours don't apply at 6pm).
  async function maybeWeeklyReport(date) {
    if (!weekly || !notifier?.report || !weekly.isDue(date)) return false;
    weekly.markSent(date);
    await notifier.report(weekly.text(weekly.build(date)));
    return true;
  }

  // 7am Pacific: the morning brief goes to Telegram and the top of the dashboard.
  async function maybeMorningBrief(date) {
    if (!brief || !notifier?.report || !brief.isDue(date)) return false;
    const written = await brief.write(date);
    if (written.text) await notifier.report(['☀️ Morning brief', '', written.text].join('\n'));
    return true;
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
      weekly: await safely('weekly report', () => maybeWeeklyReport(date), false),
      brief: await safely('morning brief', () => maybeMorningBrief(date), false),
    };
  }

  return { tick, maybeFlushApprovals, maybeHeartbeat, maybeBackup, maybeWeeklyReport, maybeMorningBrief };
}
