const ORDER = ['ask', 'tell', 'silent'];

export const PROMOTION_THRESHOLD = 20;
export const HEAVY_EDIT_RATIO = 0.25;

export const DEFAULT_POLICIES = Object.freeze({
  research: { level: 'silent', ceiling: 'silent' },
  'calendar.hold': { level: 'tell', ceiling: 'silent' },
  'email.first_contact': { level: 'ask', ceiling: 'ask' },
  'email.follow_up': { level: 'ask', ceiling: 'silent' },
  'email.portfolio_send': { level: 'ask', ceiling: 'silent' },
  'quote.standard': { level: 'ask', ceiling: 'silent' },
  'quote.large_or_custom': { level: 'ask', ceiling: 'ask' },
  'email.booking_confirmation': { level: 'ask', ceiling: 'silent' },
  'booking.cancel': { level: 'ask', ceiling: 'ask' },
  'payment.refund': { level: 'ask', ceiling: 'ask' },
  'system.demo': { level: 'ask', ceiling: 'ask' },
});

const UNKNOWN_POLICY = { level: 'ask', ceiling: 'ask' };

export function defaultPolicyFor(actionType) {
  return DEFAULT_POLICIES[actionType] ?? DEFAULT_POLICIES[actionType.split('.')[0]] ?? UNKNOWN_POLICY;
}

function toPolicy(row) {
  return {
    actionType: row.action_type,
    level: row.level,
    ceiling: row.ceiling,
    cleanApprovals: row.consecutive_clean_approvals,
    rejections: row.consecutive_rejections,
    promotionOfferedAt: row.promotion_offered_at,
    lastDemotionReason: row.last_demotion_reason,
  };
}

function nextLevel(policy) {
  const index = ORDER.indexOf(policy.level);
  const ceilingIndex = ORDER.indexOf(policy.ceiling);
  if (index === -1 || ceilingIndex === -1 || index >= ceilingIndex) return null;
  return ORDER[index + 1];
}

export function createApprovalGate({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();
  const select = db.prepare('SELECT * FROM autonomy_policies WHERE action_type = ?');

  function ensure(actionType) {
    const existing = select.get(actionType);
    if (existing) return existing;
    const policy = defaultPolicyFor(actionType);
    db.prepare('INSERT OR IGNORE INTO autonomy_policies (action_type, level, ceiling, updated_at) VALUES (?, ?, ?, ?)')
      .run(actionType, policy.level, policy.ceiling, stamp());
    return select.get(actionType);
  }

  function get(actionType) {
    return toPolicy(ensure(actionType));
  }

  function levelFor(actionType) {
    return ensure(actionType).level;
  }

  function demote(actionType, reason) {
    ensure(actionType);
    db.prepare(`UPDATE autonomy_policies SET level = CASE WHEN level = 'never' THEN 'never' ELSE 'ask' END,
        consecutive_clean_approvals = 0, consecutive_rejections = 0, promotion_offered_at = NULL,
        last_demotion_reason = ?, updated_at = ? WHERE action_type = ?`)
      .run(reason, stamp(), actionType);
    return get(actionType);
  }

  function recordApproval(actionType, editRatio = 0) {
    return transaction(() => {
      const before = get(actionType);
      if (editRatio > HEAVY_EDIT_RATIO) {
        const policy = demote(actionType, 'heavy_edit');
        return { policy, demoted: before.level !== 'ask', promotionOffer: null };
      }
      const clean = editRatio === 0 ? before.cleanApprovals + 1 : 0;
      db.prepare(`UPDATE autonomy_policies SET consecutive_clean_approvals = ?, consecutive_rejections = 0, updated_at = ?
        WHERE action_type = ?`).run(clean, stamp(), actionType);
      const policy = get(actionType);
      const to = nextLevel(policy);
      if (to && clean >= PROMOTION_THRESHOLD && !policy.promotionOfferedAt) {
        db.prepare('UPDATE autonomy_policies SET promotion_offered_at = ? WHERE action_type = ?').run(stamp(), actionType);
        return { policy: get(actionType), demoted: false, promotionOffer: { actionType, from: policy.level, to } };
      }
      return { policy, demoted: false, promotionOffer: null };
    });
  }

  function recordRejection(actionType) {
    return transaction(() => {
      const before = get(actionType);
      const rejections = before.rejections + 1;
      if (rejections >= 2) {
        const policy = demote(actionType, 'repeated_rejections');
        return { policy, demoted: before.level !== 'ask' };
      }
      db.prepare(`UPDATE autonomy_policies SET consecutive_rejections = ?, consecutive_clean_approvals = 0, updated_at = ?
        WHERE action_type = ?`).run(rejections, stamp(), actionType);
      return { policy: get(actionType), demoted: false };
    });
  }

  function promote(actionType) {
    const policy = get(actionType);
    const to = nextLevel(policy);
    if (!to) throw new Error(`${actionType} is already at its ceiling (${policy.ceiling}).`);
    db.prepare(`UPDATE autonomy_policies SET level = ?, consecutive_clean_approvals = 0, promotion_offered_at = NULL,
        updated_at = ? WHERE action_type = ?`).run(to, stamp(), actionType);
    return get(actionType);
  }

  function declinePromotion(actionType) {
    ensure(actionType);
    db.prepare(`UPDATE autonomy_policies SET consecutive_clean_approvals = 0, promotion_offered_at = NULL, updated_at = ?
      WHERE action_type = ?`).run(stamp(), actionType);
    return get(actionType);
  }

  function list() {
    return db.prepare('SELECT * FROM autonomy_policies ORDER BY action_type').all().map(toPolicy);
  }

  return { levelFor, get, recordApproval, recordRejection, promote, declinePromotion, demote, list };
}
