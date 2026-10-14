import { randomUUID } from 'node:crypto';

export class LedgerError extends Error {}

export const AUTONOMY_LEVELS = ['ask', 'tell', 'silent'];

function parseJson(value) {
  return value == null ? null : JSON.parse(value);
}

function rowToAction(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key,
    actionType: row.action_type,
    tool: row.tool,
    opportunityId: row.opportunity_id,
    payload: JSON.parse(row.payload),
    originalDraft: row.original_draft,
    why: JSON.parse(row.why),
    autonomyLevel: row.autonomy_level,
    status: row.status,
    urgent: row.urgent === 1,
    approvedBy: row.approved_by,
    rejectReason: row.reject_reason,
    editRatio: row.edit_ratio,
    costMicros: row.cost_micros,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    result: parseJson(row.result),
    outcome: parseJson(row.outcome),
    telegramMessageId: row.telegram_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    executedAt: row.executed_at,
  };
}

function cleanWhy(why) {
  if (!why || typeof why !== 'object') throw new LedgerError('Every action needs a why.');
  const goal = String(why.goal ?? '').trim();
  const expected = String(why.expected ?? '').trim();
  if (!goal) throw new LedgerError('why.goal is required.');
  if (!expected) throw new LedgerError('why.expected is required.');
  const evidence = Array.isArray(why.evidence) ? why.evidence.map((item) => String(item)) : [];
  return { goal, expected, evidence };
}

export function createLedger({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const selectById = db.prepare('SELECT * FROM actions WHERE id = ?');
  const selectByKey = db.prepare('SELECT * FROM actions WHERE idempotency_key = ?');

  function get(id) {
    return rowToAction(selectById.get(id));
  }

  function requireStatus(id, allowed) {
    const action = get(id);
    if (!action) throw new LedgerError(`Action not found: ${id}`);
    if (!allowed.includes(action.status)) {
      throw new LedgerError(`Action ${id} is ${action.status}; expected ${allowed.join(' or ')}.`);
    }
    return action;
  }

  function propose({ idempotencyKey, actionType, tool, payload = {}, why, autonomyLevel, opportunityId = null, urgent = false }) {
    if (!String(idempotencyKey ?? '').trim()) throw new LedgerError('idempotencyKey is required.');
    if (!AUTONOMY_LEVELS.includes(autonomyLevel)) throw new LedgerError(`Invalid autonomy level: ${autonomyLevel}`);
    const reason = cleanWhy(why);
    return transaction(() => {
      const existing = selectByKey.get(idempotencyKey);
      if (existing) return { action: rowToAction(existing), created: false };
      const id = `act_${randomUUID()}`;
      const time = stamp();
      const status = autonomyLevel === 'ask' ? 'proposed' : 'approved';
      db.prepare(`INSERT INTO actions (id, idempotency_key, action_type, tool, opportunity_id, payload, original_draft, why,
          autonomy_level, status, urgent, approved_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, idempotencyKey, actionType, tool, opportunityId, JSON.stringify(payload), String(payload.draft ?? ''),
          JSON.stringify(reason), autonomyLevel, status, urgent ? 1 : 0, status === 'approved' ? 'auto' : '', time, time);
      return { action: get(id), created: true };
    });
  }

  function approve(id, { by = 'owner', editRatio = 0 } = {}) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare("UPDATE actions SET status = 'approved', approved_by = ?, edit_ratio = ?, updated_at = ? WHERE id = ?")
        .run(by, editRatio, stamp(), id);
      return get(id);
    });
  }

  function reject(id, { reason = 'other' } = {}) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare("UPDATE actions SET status = 'rejected', reject_reason = ?, updated_at = ? WHERE id = ?")
        .run(reason, stamp(), id);
      return get(id);
    });
  }

  function revise(id, payload) {
    return transaction(() => {
      requireStatus(id, ['proposed']);
      db.prepare('UPDATE actions SET payload = ?, telegram_message_id = NULL, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(payload), stamp(), id);
      return get(id);
    });
  }

  function claimNextDue() {
    return transaction(() => {
      const row = db.prepare(`SELECT id FROM actions WHERE status = 'approved'
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at, id LIMIT 1`).get(stamp());
      if (!row) return null;
      db.prepare("UPDATE actions SET status = 'executing', attempts = attempts + 1, updated_at = ? WHERE id = ?")
        .run(stamp(), row.id);
      return get(row.id);
    });
  }

  function markDone(id, result = {}) {
    return transaction(() => {
      requireStatus(id, ['executing']);
      const time = stamp();
      db.prepare(`UPDATE actions SET status = 'done', result = ?, last_error = '', next_attempt_at = NULL,
          executed_at = ?, updated_at = ? WHERE id = ?`)
        .run(JSON.stringify(result), time, time, id);
      return get(id);
    });
  }

  function markFailed(id, error, { retryAt = null } = {}) {
    return transaction(() => {
      requireStatus(id, ['executing']);
      const status = retryAt ? 'approved' : 'failed';
      db.prepare('UPDATE actions SET status = ?, last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?')
        .run(status, String(error).slice(0, 2000), retryAt, stamp(), id);
      return get(id);
    });
  }

  function recoverInterrupted() {
    const result = db.prepare(`UPDATE actions SET status = 'approved', last_error = 'interrupted by restart', updated_at = ?
      WHERE status = 'executing'`).run(stamp());
    return Number(result.changes);
  }

  function addCost(id, micros) {
    db.prepare('UPDATE actions SET cost_micros = cost_micros + ? WHERE id = ?').run(Math.round(micros), id);
  }

  function setTelegramMessage(id, messageId) {
    db.prepare('UPDATE actions SET telegram_message_id = ? WHERE id = ?').run(messageId, id);
  }

  function list({ status = null, limit = 20 } = {}) {
    const rows = status
      ? db.prepare('SELECT * FROM actions WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(status, limit)
      : db.prepare('SELECT * FROM actions ORDER BY created_at DESC, id DESC LIMIT ?').all(limit);
    return rows.map(rowToAction);
  }

  function pendingUnsent() {
    return db.prepare(`SELECT * FROM actions WHERE status = 'proposed' AND telegram_message_id IS NULL
      ORDER BY created_at, id`).all().map(rowToAction);
  }

  return {
    get, propose, approve, reject, revise, claimNextDue, markDone, markFailed,
    recoverInterrupted, addCost, setTelegramMessage, list, pendingUnsent,
  };
}
