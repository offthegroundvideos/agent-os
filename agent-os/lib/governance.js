export const WINNER_THRESHOLD = {
  fiveXScoreMin: 5,
  saveRateMin: 0.03,
  shareRateMin: 0.01,
  commentToDmConversionMin: 0.05,
};

export const REPURPOSE_THRESHOLD = {
  winnerRequired: true,
  hookRetentionSignal: 'strong',
};

export const ESCALATION_RULES = [
  'Low-confidence outputs below 0.65 require human review.',
  'Broken funnel steps escalate immediately.',
  'High-view, low-conversion content triggers CTA review.',
  'Low-retention content triggers hook review.',
  'Repeated low-performing topics should be paused.',
];

export const GOVERNANCE_RULES = {
  publishRoles: ['human', 'ceo', 'cto'],
  funnelEditRoles: ['human', 'ceo', 'cto', 'dev'],
};

export function canApprovePublish(role) {
  return GOVERNANCE_RULES.publishRoles.includes(role);
}

export function evaluateWinner(performance = {}) {
  const fiveXScore = Number(performance.fiveXScore || 0);
  const saveRate = Number(performance.saveRate || 0);
  const shareRate = Number(performance.shareRate || 0);
  const commentToDmConversion = Number(performance.commentToDmConversion || 0);

  const winner = fiveXScore >= WINNER_THRESHOLD.fiveXScoreMin &&
    saveRate >= WINNER_THRESHOLD.saveRateMin &&
    shareRate >= WINNER_THRESHOLD.shareRateMin;

  return {
    winner,
    repurposeCandidate: winner && commentToDmConversion >= WINNER_THRESHOLD.commentToDmConversionMin,
    thresholds: WINNER_THRESHOLD,
  };
}
