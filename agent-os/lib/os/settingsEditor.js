// The OTG-OS settings the owner may change from the dashboard, each with the check it must pass.
// Everything else in settings.js is internal state (offsets, cursors, last-run stamps) and stays read-only.
import { LANES } from './gigs/constants.js';

export class SettingsEditError extends Error {}

export const OUTREACH_MODES = ['draft', 'send'];

const MAX_LANE_QUERIES = 12;
const MAX_QUERY_LENGTH = 300;

function integer(value, { min, max, name }) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new SettingsEditError(`${name} must be a whole number from ${min} to ${max}.`);
  }
  return number;
}

const count = (name, min, max) => (value) => integer(value, { name, min, max });

function hourRange(name, { startKey, endKey, allowWrap }) {
  return (value) => {
    if (!value || typeof value !== 'object') throw new SettingsEditError(`${name} needs a start and an end hour.`);
    const start = integer(value[startKey], { name: `${name} start`, min: 0, max: 23 });
    const end = integer(value[endKey], { name: `${name} end`, min: allowWrap ? 0 : 1, max: allowWrap ? 23 : 24 });
    if (start === end || (!allowWrap && start > end)) throw new SettingsEditError(`${name} must end after it starts.`);
    return { [startKey]: start, [endKey]: end };
  };
}

export const EDITABLE_SETTINGS = Object.freeze({
  'outreach.mode': {
    label: 'Outreach mode',
    validate(value) {
      if (!OUTREACH_MODES.includes(value)) throw new SettingsEditError(`Outreach mode must be ${OUTREACH_MODES.join(' or ')}.`);
      return value;
    },
  },
  'outreach.daily_pitch_limit': { label: 'First emails per day', validate: count('First emails per day', 0, 100) },
  'outreach.daily_email_limit': { label: 'All emails per day', validate: count('All emails per day', 0, 200) },
  'outreach.follow_up_days': {
    label: 'Follow-up days after the first email',
    validate(value) {
      if (!Array.isArray(value) || value.length > 5) throw new SettingsEditError('Follow-up days must be a list of up to 5 days.');
      const days = value.map((day) => integer(day, { name: 'A follow-up day', min: 1, max: 60 }));
      if (days.some((day, i) => i > 0 && day <= days[i - 1])) throw new SettingsEditError('Follow-up days must go up, for example 4, 9.');
      return days;
    },
  },
  'outreach.close_after_days': { label: 'Close after the last follow-up (days)', validate: count('Close after', 1, 90) },
  'outreach.window': {
    label: 'Sending window (recipient\'s local hours, weekdays)',
    validate: hourRange('The sending window', { startKey: 'startHour', endKey: 'endHour', allowWrap: false }),
  },
  'telegram.quiet_hours': {
    label: 'Telegram quiet hours (Pacific)',
    validate: hourRange('Quiet hours', { startKey: 'start', endKey: 'end', allowWrap: true }),
  },
  'gigs.daily_searches': { label: 'Prospect searches per weekday', validate: count('Prospect searches per day', 0, 20) },
  'gigs.daily_research': { label: 'Prospects researched per day', validate: count('Prospects researched per day', 0, 100) },
  'goals.monthly_shoot_days': { label: 'Goal: paid shoot days per month', validate: count('The monthly goal', 1, 100) },
  'chat.console_model': {
    label: 'Console answers',
    validate(value) {
      if (!['claude', 'local'].includes(value)) throw new SettingsEditError('Console answers must be claude or local.');
      return value;
    },
  },
});

export function createSettingsEditor({ settings }) {
  function values() {
    return Object.fromEntries(Object.keys(EDITABLE_SETTINGS).map((key) => [key, settings.get(key)]));
  }

  function update(key, value) {
    const rule = EDITABLE_SETTINGS[key];
    if (!rule) throw new SettingsEditError(`${key} can't be changed from the dashboard.`);
    return settings.set(key, rule.validate(value));
  }

  // Switches a prospecting lane on or off, or replaces its search queries. Pausing outreach in a lane is separate
  // (outreach.paused_lanes, through the Gig Engine's setLanePaused, the same as /lane).
  function updateLane(lane, { active, queries } = {}) {
    if (!LANES.includes(lane)) throw new SettingsEditError(`Lanes are: ${LANES.join(', ')}`);
    const lanes = settings.get('gigs.lanes');
    const next = { ...lanes[lane] };
    if (active !== undefined) {
      if (typeof active !== 'boolean') throw new SettingsEditError('active must be true or false.');
      next.active = active;
    }
    if (queries !== undefined) {
      if (!Array.isArray(queries)) throw new SettingsEditError('Queries must be a list.');
      const clean = queries.map((query) => String(query ?? '').trim()).filter(Boolean);
      if (!clean.length) throw new SettingsEditError('A lane needs at least one search query.');
      if (clean.length > MAX_LANE_QUERIES) throw new SettingsEditError(`A lane can have up to ${MAX_LANE_QUERIES} queries.`);
      if (clean.some((query) => query.length > MAX_QUERY_LENGTH)) throw new SettingsEditError(`Each query must be under ${MAX_QUERY_LENGTH} characters.`);
      next.queries = clean;
    }
    settings.set('gigs.lanes', { ...lanes, [lane]: next });
    return next;
  }

  return { values, update, updateLane };
}
