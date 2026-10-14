const MESSAGE_LIMIT = 3500;

export const LEVEL_LABELS = { ask: 'Ask', tell: 'Tell', silent: 'Silent', never: 'Never' };

export const REJECT_REASONS = {
  wrong_target: 'Wrong target',
  wrong_tone: 'Wrong tone',
  bad_timing: 'Bad timing',
  other: 'Other',
};

export function truncate(text, max = MESSAGE_LIMIT) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function approvalText(action, description) {
  const lines = [
    `🟡 Approval needed · ${action.actionType}`,
    '',
    description,
    '',
    `Why: ${action.why.goal}`,
    `Expected: ${action.why.expected}`,
  ];
  if (action.why.evidence?.length) lines.push(`Evidence: ${action.why.evidence.join('; ')}`);
  return truncate(lines.join('\n'));
}

export function approvalKeyboard(actionId) {
  return {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `a:${actionId}` },
      { text: '✏️ Edit', callback_data: `e:${actionId}` },
      { text: '❌ Reject', callback_data: `r:${actionId}` },
    ]],
  };
}

export function rejectReasonKeyboard(actionId) {
  return {
    inline_keyboard: Object.entries(REJECT_REASONS).map(([key, label]) => [{ text: label, callback_data: `rr:${actionId}:${key}` }]),
  };
}

export function promotionKeyboard(actionType) {
  return {
    inline_keyboard: [[
      { text: '⬆️ Yes, promote', callback_data: `p:${actionType}` },
      { text: 'Keep asking', callback_data: `k:${actionType}` },
    ]],
  };
}
