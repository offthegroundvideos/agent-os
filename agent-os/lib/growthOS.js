export const GROWTH_OS_MISSION = `This system is a multi-agent viral content growth OS. The mission is to find proven short-form content patterns, analyze why they worked, rebuild them using original expertise, publish them at scale, and convert attention into leads.`;

export const GROWTH_OS_GLOBAL_RULES = [
  'Prioritize hook first, script second, format third, editing fourth.',
  'Use the 5x rule to qualify source content: views must be at least 5 times follower count.',
  'Optimize visual, written, and verbal hooks in the first 3 seconds.',
  'One video should teach one idea.',
  'Value must start immediately after the hook.',
  'Use broad hook, narrow value, niche CTA.',
  'All outputs should improve repeatable growth, authority, qualified leads, and sales.',
];

export const GROWTH_OS_CORE_AGENTS = [
  'Strategy Orchestrator',
  'Niche Research Agent',
  'Viral Filter Agent',
  'Video Deconstruction Agent',
  'Pattern Synthesis Agent',
  'Script Strategy Agent',
  'Script Writing Agent',
  'Production Brief Agent',
  'Editing Direction Agent',
  'Publishing Agent',
  'Funnel Automation Agent',
  'Performance Analyst Agent',
  'Repurposing Agent',
  'QA Agent',
];

export const GROWTH_OS_SHARED_MEMORY = [
  'Brand Profile',
  'Content OS Strategy Layer',
  'Offer Map',
  'Niche Research Database',
  'Viral Video Analysis Library',
  'Pattern Library',
  'Script Bank',
  'Performance Database',
  'Proof Library',
  'Claim Registry',
  'Negative Pattern Library',
  'Lead Quality Feedback',
  'Experiment Log',
  'Production Reality Memory',
];

export const GROWTH_OS_WORKFLOW = [
  'Define strategy',
  'Research creators',
  'Filter by 5x rule',
  'Deconstruct winning videos',
  'Synthesize patterns',
  'Choose script priorities',
  'Write scripts',
  'Build production briefs',
  'Edit',
  'Publish',
  'Route leads through automation',
  'Analyze performance',
  'Repurpose winners into multiple variations',
];

export const STANDARD_HANDOFF_FIELDS = [
  'task_name',
  'asset_id',
  'source_inputs',
  'summary',
  'outputs',
  'open_issues',
  'confidence',
  'recommended_next_step',
];

export function buildGrowthOSContext() {
  return [
    GROWTH_OS_MISSION,
    'GLOBAL RULES:',
    ...GROWTH_OS_GLOBAL_RULES.map(rule => `- ${rule}`),
    `CORE AGENTS: ${GROWTH_OS_CORE_AGENTS.join(', ')}`,
    `SHARED MEMORY: ${GROWTH_OS_SHARED_MEMORY.join(', ')}`,
    `STANDARD WORKFLOW: ${GROWTH_OS_WORKFLOW.join(' -> ')}`,
    `STANDARD HANDOFF FIELDS: ${STANDARD_HANDOFF_FIELDS.join(', ')}`,
  ].join('\n');
}

export function buildStandardHandoffInstruction(taskName, assetIdHint, outputsExample) {
  return [
    'End with the completion marker and one valid JSON handoff object.',
    `The handoff object must include these exact top-level fields: ${STANDARD_HANDOFF_FIELDS.join(', ')}.`,
    `Use "${taskName}" for task_name.`,
    `Use a stable asset_id like "${assetIdHint}".`,
    'Put your agent-specific structured deliverables inside outputs.',
    'Set confidence as a number from 0 to 1.',
    `Example shape: {"task_name":"${taskName}","asset_id":"${assetIdHint}","source_inputs":[],"summary":"","outputs":${outputsExample},"open_issues":[],"confidence":0.78,"recommended_next_step":""}`,
  ].join(' ');
}
