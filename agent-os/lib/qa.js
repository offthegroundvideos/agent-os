import { addQaReview, recordApproval } from './assets.js';

export const QA_RUBRICS = {
  script: {
    id: 'script',
    name: 'Script QA',
    criteria: [
      'One video teaches one idea',
      'Hook is present in the first line',
      'Value begins immediately after the hook',
      'Language is simple and specific',
      'CTA is present and relevant',
      'Script matches audience awareness level',
      'Hook-body match is clear',
      'Visual, written, and verbal hooks are intentionally defined',
    ],
    passThreshold: 7,
  },
  final_content: {
    id: 'final_content',
    name: 'Final Content QA',
    criteria: [
      'First-frame instructions were followed',
      'Format is correct and clear',
      'Edit tier matches content priority',
      'Captions follow standard',
      'CTA matches the correct automation trigger',
      'Funnel links are connected and correct',
      'No hook-body mismatch',
      'Publish-ready quality is met',
    ],
    passThreshold: 7,
  },
};

export const REWORK_REASONS = [
  'hook_body_mismatch',
  'weak_hook',
  'unclear_value',
  'cta_misalignment',
  'awareness_mismatch',
  'edit_scope_mismatch',
  'broken_funnel_link',
  'caption_issue',
  'brand_safety',
  'other',
];

export function recordQaReview({ assetId, rubricId, scores = [], notes = '', reviewer = 'human', reworkReasons = [] }) {
  const rubric = QA_RUBRICS[rubricId];
  if (!rubric) throw new Error('Unknown QA rubric');
  const numericScores = scores.map(score => Number(score)).filter(score => Number.isFinite(score));
  const averageScore = numericScores.length
    ? Number((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length).toFixed(2))
    : 0;
  const passed = averageScore >= rubric.passThreshold;
  const review = {
    id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    rubricId,
    reviewer,
    scores: numericScores,
    averageScore,
    passed,
    notes,
    reworkReasons,
    createdAt: new Date().toISOString(),
  };

  addQaReview(assetId, review);

  if (rubricId === 'script') {
    recordApproval(assetId, 'scriptApproved', passed, { changedBy: reviewer, reason: notes });
  }
  if (rubricId === 'final_content') {
    recordApproval(assetId, 'finalQaApproved', passed, { changedBy: reviewer, reason: notes });
  }

  return review;
}
