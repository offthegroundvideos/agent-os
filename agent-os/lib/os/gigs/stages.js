// lib/os/gigs/stages.js
import { STAGES } from './constants.js';

export class StageError extends Error {}

export const TRANSITIONS = Object.freeze({
  found: ['researched', 'closed_lost', 'closed_below_minimum'],
  researched: ['pitched', 'closed_lost', 'closed_below_minimum', 'closed_unsubscribed'],
  pitched: ['following_up', 'replied', 'closed_bounced', 'closed_unsubscribed', 'closed_lost'],
  following_up: ['replied', 'closed_bounced', 'closed_unsubscribed', 'closed_lost'],
  replied: ['portfolio_sent', 'quoted', 'closed_no', 'closed_not_now', 'closed_unsubscribed', 'closed_lost'],
  portfolio_sent: ['replied', 'quoted', 'closed_no', 'closed_not_now', 'closed_unsubscribed', 'closed_lost'],
  quoted: ['replied', 'held', 'booked', 'closed_no', 'closed_not_now', 'closed_unsubscribed', 'closed_lost'],
  held: ['booked', 'closed_no', 'closed_hold_expired', 'closed_unsubscribed', 'closed_lost'],
  closed_not_now: ['researched', 'replied', 'closed_unsubscribed', 'closed_lost'],
  closed_lost: ['replied'],
});

const PATCHABLE = new Set([
  'contact_id', 'angle', 'evidence', 'style', 'portfolio_ids', 'gmail_thread_id', 'last_message_id_header', 'subject',
  'pitched_at', 'follow_ups_sent', 'next_follow_up_at', 'check_in_at', 'close_reason',
]);
const JSON_COLUMNS = new Set(['evidence', 'portfolio_ids']);
const TEXT_COLUMNS = new Set(['angle', 'style', 'subject', 'last_message_id_header', 'close_reason']);

export function canMove(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function createStages({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();

  function load(id, expectedVersion) {
    const row = db.prepare('SELECT stage, version FROM opportunities WHERE id = ?').get(id);
    if (!row) throw new StageError(`Opportunity not found: ${id}`);
    if (expectedVersion != null && row.version !== expectedVersion) {
      throw new StageError(`Opportunity ${id} changed (version ${row.version}, expected ${expectedVersion}).`);
    }
    return row;
  }

  function normalize(key, value) {
    if (JSON_COLUMNS.has(key)) {
      if (value == null) return '[]';
      if (!Array.isArray(value)) throw new StageError(`${key} must be an array.`);
      return JSON.stringify(value);
    }
    if (TEXT_COLUMNS.has(key)) return value ?? '';
    if (key === 'follow_ups_sent') return value ?? 0;
    return value ?? null;
  }

  function write(id, patch, at) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new StageError('patch must be an object.');
    const entries = Object.entries(patch);
    for (const [key] of entries) {
      if (key !== 'stage' && !PATCHABLE.has(key)) throw new StageError(`Cannot set ${key} on an opportunity.`);
    }
    const sets = [...entries.map(([key]) => `${key} = ?`), 'version = version + 1', 'updated_at = ?'];
    const values = entries.map(([key, value]) => normalize(key, value));
    db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ?`).run(...values, at, id);
  }

  const run = (fn) => (db.isTransaction ? fn() : transaction(fn));

  function move(id, to, { reason = '', actor = 'otg-os', patch = {}, expectedVersion = null } = {}) {
    if (!STAGES.includes(to)) throw new StageError(`Unknown stage: ${to}`);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new StageError('patch must be an object.');
    return run(() => {
      const row = load(id, expectedVersion);
      if (!canMove(row.stage, to)) throw new StageError(`Cannot move ${id} from ${row.stage} to ${to}.`);
      const at = stamp();
      write(id, { ...patch, stage: to }, at);
      db.prepare('INSERT INTO stage_events (opportunity_id, from_stage, to_stage, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, row.stage, to, String(reason ?? '').slice(0, 500), String(actor || 'otg-os'), at);
      return { from: row.stage, to, version: row.version + 1 };
    });
  }

  function update(id, patch, { expectedVersion = null } = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new StageError('patch must be an object.');
    if ('stage' in patch) throw new StageError('Use move() to change the stage.');
    return run(() => {
      const row = load(id, expectedVersion);
      write(id, patch, stamp());
      return { stage: row.stage, version: row.version + 1 };
    });
  }

  function events(id) {
    return db.prepare('SELECT from_stage, to_stage, reason, actor, created_at FROM stage_events WHERE opportunity_id = ? ORDER BY id').all(id)
      .map((row) => ({ from: row.from_stage, to: row.to_stage, reason: row.reason, actor: row.actor, at: row.created_at }));
  }

  return { move, update, events };
}
