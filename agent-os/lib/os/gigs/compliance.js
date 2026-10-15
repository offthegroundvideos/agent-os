// Outreach rules from the spec: CAN-SPAM footer, weekday 9-5 in the recipient's time zone, daily limits, auto-pause.

export function emailFooter({ senderName, mailingAddress }) {
  return [
    '',
    '--',
    `${senderName} · OFF THE GROUND · madebyotg.com`,
    mailingAddress,
    'Not the right person, or not interested? Reply "unsubscribe" and I won\'t email you again.',
  ].join('\n');
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return {
    weekday: WEEKDAYS[parts.find((part) => part.type === 'weekday').value],
    hour: Number(parts.find((part) => part.type === 'hour').value),
  };
}

export function inSendingWindow(date, timeZone, { startHour = 9, endHour = 17 } = {}) {
  const { weekday, hour } = localParts(date, timeZone);
  return weekday >= 1 && weekday <= 5 && hour >= startHour && hour < endHour;
}

const STEP_MS = 15 * 60_000;

export function nextSendingTime(date, timeZone, window = {}) {
  if (inSendingWindow(date, timeZone, window)) return date;
  let candidate = new Date(Math.ceil(date.getTime() / STEP_MS) * STEP_MS);
  for (let i = 0; i < 4 * 24 * 8; i += 1) {
    if (inSendingWindow(candidate, timeZone, window)) return candidate;
    candidate = new Date(candidate.getTime() + STEP_MS);
  }
  return candidate;
}

export function sendBlock({ store, settings, lane, kind }) {
  const paused = settings.get('outreach.paused_lanes')[lane];
  if (paused) return { reason: `${lane} outreach is paused: ${paused}`, waitHours: 6 };
  if (kind === 'pitch' && store.emailsInLast24h({ kind: 'pitch' }) >= settings.get('outreach.daily_pitch_limit')) {
    return { reason: 'daily pitch limit reached', waitHours: 1 };
  }
  if (store.emailsInLast24h() >= settings.get('outreach.daily_email_limit')) return { reason: 'daily email limit reached', waitHours: 1 };
  return null;
}

export const MIN_SENDS_FOR_HEALTH = 10;

export function laneHealth({ sends, bounces, unsubscribes }) {
  if (sends < MIN_SENDS_FOR_HEALTH) return null;
  const pct = (count) => Math.round((count / sends) * 100);
  if (bounces / sends > 0.05) return `bounce rate ${pct(bounces)}% over the last ${sends} sends`;
  if (unsubscribes / sends > 0.02) return `unsubscribe rate ${pct(unsubscribes)}% over the last ${sends} sends`;
  return null;
}
