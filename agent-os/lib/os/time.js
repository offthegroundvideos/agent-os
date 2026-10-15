const PACIFIC = 'America/Los_Angeles';

export function pacificParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

export function pacificDateKey(date = new Date()) {
  const { year, month, day } = pacificParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isQuietHour(date, { start = 21, end = 7 } = {}) {
  const { hour } = pacificParts(date);
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

export function utcMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

export function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

// The UTC instant of midnight Pacific on the given date's Pacific day (DST-aware via the noon offset).
export function pacificDayStart(date = new Date()) {
  const { year, month, day } = pacificParts(date);
  const offsetHours = pacificParts(new Date(Date.UTC(year, month - 1, day, 12))).hour - 12;
  return new Date(Date.UTC(year, month - 1, day, -offsetHours)).toISOString();
}
