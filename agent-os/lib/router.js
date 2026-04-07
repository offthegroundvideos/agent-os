import { SHORTCUTS, ROUTER_KEYWORDS } from './agents.js';
import { buildStandardHandoffInstruction } from './growthOS.js';

// deepseek-r1 outputs <think>...</think> blocks before its actual response.
// These must be stripped before passing output to other agents or they echo the reasoning.
export function stripThinkBlocks(output) {
  return output.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

export function routeMessage(message) {
  const lower = message.toLowerCase().trim();

  for (const [shortcut, agentId] of Object.entries(SHORTCUTS)) {
    if (lower.startsWith(shortcut)) {
      return {
        agentId,
        message: message.replace(new RegExp('^' + shortcut + '\\s*', 'i'), '').trim(),
        method: 'shortcut',
      };
    }
  }

  if (lower.startsWith('run full pipeline on') || lower.startsWith('run pipeline on')) {
    const topic = message.replace(/^run (full )?pipeline on\s*/i, '').trim();
    return { agentId: 'pipeline', message: topic, method: 'pipeline' };
  }

  const scores = {};
  for (const [agentId, keywords] of Object.entries(ROUTER_KEYWORDS)) {
    scores[agentId] = keywords.filter(k => lower.includes(k)).length;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const runnerUp = sorted[1];

  if (top && top[1] >= 2) {
    return { agentId: top[0], message, method: 'auto-routed' };
  }
  if (top && top[1] === 1 && runnerUp && runnerUp[1] === 0) {
    return { agentId: top[0], message, method: 'auto-routed' };
  }

  return { agentId: 'alex', message, method: 'default' };
}

const COMPLETION_MARKERS = {
  alex: '[RESEARCH_COMPLETE]',
  maya: '[CONTENT_COMPLETE]',
  sam: '[SOCIAL_COMPLETE]',
  jordan: '[STRATEGY_COMPLETE]',
  luna: '[QUALIFIED]',
  rex: '[PROPOSAL_COMPLETE]',
  nova: '[CLIENT_COMPLETE]',
  iris: '[PRODUCTION_COMPLETE]',
};

function extractBalancedJson(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

export function extractHandoffJson(agentId, output) {
  const marker = COMPLETION_MARKERS[agentId];
  if (!marker || !output.includes(marker)) return null;
  const after = output.substring(output.indexOf(marker) + marker.length).trim();
  const jsonText = extractBalancedJson(after);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

export function extractNarrativeSummary(agentId, output, wordCap = 600) {
  const marker = COMPLETION_MARKERS[agentId];
  const narrative = (marker && output.includes(marker))
    ? output.substring(0, output.indexOf(marker)).trim()
    : output.trim();
  const words = narrative.split(/\s+/);
  if (words.length <= wordCap) return narrative;
  return words.slice(0, wordCap).join(' ') + '\n[...summary truncated for handoff efficiency]';
}

export function buildHandoffContext(completedSteps) {
  if (!completedSteps || completedSteps.length === 0) return '';

  const lines = ['[CONTEXT FROM PRIOR AGENTS - reference the data, do NOT repeat or summarize it]'];

  for (const step of completedSteps) {
    lines.push(`${step.agentName} (${step.role}):`);
    if (step.handoffJson) {
      lines.push(JSON.stringify(step.handoffJson));
    }
    if (step.narrativeSummary) {
      const brief = step.narrativeSummary
        .split(/[.!?\n]/)
        .filter(s => s.trim())
        .slice(0, 3)
        .join('. ')
        .trim();
      if (brief) lines.push(brief + '.');
    }
    lines.push('');
  }

  lines.push('[END CONTEXT - begin YOUR deliverables now, never repeat what is above]');
  return lines.join('\n');
}

const STANDARD_HANDOFF_INSTRUCTIONS = {
  alex: buildStandardHandoffInstruction('niche_research', 'research-alex-001', '{"niche":"","platforms":[],"creators_analyzed":0,"videos_analyzed":0,"top_hooks":[],"viral_formats":[],"target_audience":"","key_insight":"","content_angles":[],"lead_sources":[],"confidence_notes":[]}'),
  iris: buildStandardHandoffInstruction('production_brief', 'production-iris-001', '{"visual_thesis":"","hero_direction":"","proof_style":"","shot_list":[],"production_schedule":[],"equipment":[],"client_prep":[],"post_notes":[],"team_assignments":[]}'),
  maya: buildStandardHandoffInstruction('script_writing', 'script-bank-maya-001', '{"scripts_written":0,"primary_hook_style":"","formats_used":[],"cta_trigger_word":"","key_themes":[],"best_script_index":0,"scripts":[],"caption_angles":[]}'),
  sam: buildStandardHandoffInstruction('publishing_plan', 'publishing-sam-001', '{"total_posts":0,"platforms":[],"posting_frequency":"","top_content_type":"","manychat_triggers":[],"shoot_days_needed":0,"editors_needed":[],"reformats":[],"asset_needs":[],"repurpose_plan":[]}'),
  jordan: buildStandardHandoffInstruction('growth_strategy', 'strategy-jordan-001', '{"primary_offer":"","primary_channel":"","funnel_steps":[],"lead_magnet":"","manychat_trigger":"","30_day_goal":"","60_day_goal":"","90_day_goal":"","kpis":[],"monetization_ideas":[],"offer_stack":[],"objection_map":[],"testing_plan":[]}'),
  luna: buildStandardHandoffInstruction('lead_qualification', 'lead-luna-001', '{"name":"","service_needed":"","timeline":"","budget_range":"","location":"","score":0,"next_step":"","recommended_package":"","fit_reasons":[],"dealbreakers":[],"notes":""}'),
  rex: buildStandardHandoffInstruction('sales_proposal', 'proposal-rex-001', '{"primary_offer":"","tiers":[],"deadline":"","payment_options":[],"next_steps":[],"objection_answers":[],"follow_up_sequence":[]}'),
  nova: buildStandardHandoffInstruction('client_success_plan', 'client-success-nova-001', '{"welcome_message":"","onboarding_sequence":[],"post_delivery_sequence":[],"retainer_schedule":[],"upsell_timing":[],"review_request":"","referral_request":"","risk_flags":[],"renewal_signal":""}'),
};

export function buildPipelinePrompt(agentId, topic, previousOutput, completedSteps = [], researchContext = '') {
  const base = `You are working as part of the OTG Icon agency pipeline.\nTOPIC: "${topic}"\n\n`;
  const groundedResearch = researchContext ? researchContext + '\n\n' : '';
  const context = completedSteps.length > 0
    ? buildHandoffContext(completedSteps) + '\n\n'
    : (previousOutput ? 'PREVIOUS AGENT OUTPUT:\n' + previousOutput + '\n\n' : '');

  const prompts = {
    alex: base + groundedResearch +
      'YOUR JOB - Research this topic for the OTG Icon pipeline. Be concise, actionable, and grounded in the 5X rule.\n\n' +
      'Deliver in this order:\n' +
      '1. MARKET SNAPSHOT - 2-3 sentences on opportunity size and who is winning right now\n' +
      '2. PLATFORM SPLIT - what is working on each relevant platform before combining anything\n' +
      '3. TOP 20 CREATORS - creator, platform, follower count, and which ones clear the 5X rule consistently\n' +
      '4. VIDEO BREAKDOWN - summarize the strongest patterns from 10-20 videos per creator when possible with topic, views, 5X score, format, edit style, visual hook, written hook, verbal hook, and value delivery\n' +
      '5. TOP 3 CONTENT ANGLES - specific hook examples that are working RIGHT NOW\n' +
      '6. VIRAL FORMATS - which formats perform best on each platform in this niche\n' +
      '7. TARGET AUDIENCE - who they are and where they spend time\n' +
      '8. OTG OPPORTUNITY - what gap OTG can own that competitors miss\n' +
      '9. LEAD SOURCES - where to find clients needing OTG services in this niche\n' +
      '10. CONFIDENCE NOTES - what is observed vs inferred and where data is weak\n\n' +
      'Keep total output under 900 words. Maya, Iris, and Sam need actionable angles, not exhaustive lists. No fluff.\n\n' +
      'End with [RESEARCH_COMPLETE].',

    iris: base + groundedResearch + context +
      'Do not repeat or summarize the context above. Begin with the visual direction, then the production plan.\n\n' +
      'YOUR JOB - Create the visual direction and production plan based on this topic.\n\n' +
      'Deliver:\n' +
      '1. VISUAL THESIS - the emotional image world and what the audience should feel immediately\n' +
      '2. HERO and PAGE DIRECTION - hero composition, image language, proof style, and what the page or campaign should not feel like\n' +
      '3. Full shot list with shot number, type, lens, and lighting setup\n' +
      '4. Production schedule from arrival to wrap\n' +
      '5. Equipment list - cameras, lenses, lights, drone, audio\n' +
      '6. Client prep instructions\n' +
      '7. Post-production notes - color grade, edit style, music suggestions\n' +
      '8. OTG team assignments - Jack for camera/drone, Swope or Teja for editing\n\n' +
      'End with [PRODUCTION_COMPLETE].',

    maya: base + groundedResearch + context +
      'Do not repeat or summarize the research above. Begin writing scripts now.\n\n' +
      'YOUR JOB - Write a complete content package based on the research above.\n\n' +
      'Create:\n' +
      '1. 15 viral video scripts using: [FORMAT] [FILMING NOTES] [VISUAL HOOK] [WRITTEN HOOK] [HOOK LINE] [VALUE bullets] [CTA with trigger word]\n' +
      '2. 5 Instagram caption templates with hooks\n' +
      '3. 2 LinkedIn post drafts\n' +
      '4. 1 email subject line for lead nurture\n' +
      '5. 2 ad copy variations for paid campaigns\n\n' +
      'Use the research angles and target audience above. Pull hooks and topics from proven winners, but write the value using OTG expertise. Keep the value immediate, concrete, and specific. All content must drive leads to OTG Icon services.\n\n' +
      'End with [CONTENT_COMPLETE].',

    sam: base + groundedResearch + context +
      'Do not repeat or summarize any prior agent output. Begin your social package now.\n\n' +
      'YOUR JOB - Build a complete social media package from all the content above.\n\n' +
      'Deliver:\n' +
      '1. 30-day posting calendar with specific dates, times, and platforms\n' +
      '2. Platform-specific versions of the top 3 scripts (Instagram Reels + TikTok)\n' +
      '3. Hashtag strategy - Instagram: 5-10 tags, TikTok: 3-5 tags, LinkedIn: 3 tags\n' +
      '4. ManyChat trigger words for each post\n' +
      '5. Batch shoot schedule - grouped by format, ordered easiest to hardest\n' +
      '6. Reformat plan - if one concept hits, list 3 alternate formats to repost the same idea\n' +
      '7. Asset needs - what footage, graphics, testimonials, or proof is required to publish cleanly\n' +
      '8. Editor assignments - basic: any team member, advanced: Swope or Teja\n\n' +
      'End with [SOCIAL_COMPLETE].',

    jordan: base + groundedResearch + context +
      'Do not repeat or summarize any prior agent output. Begin your growth strategy now.\n\n' +
      'YOUR JOB - Build a complete growth strategy based on ALL the pipeline work above.\n\n' +
      'First answer these 5 questions:\n' +
      '1. WHO is the exact target customer and where do they spend time online?\n' +
      '2. WHAT is the one offer that converts them fastest?\n' +
      '3. HOW do we get in front of them at lowest cost?\n' +
      '4. WHY will they choose OTG over competitors?\n' +
      '5. WHEN is the right moment to ask for the sale?\n\n' +
      'Then deliver:\n' +
      '1. Primary offer - the one offer OTG should lead with first\n' +
      '2. 30/60/90 day growth plan with specific milestones\n' +
      '3. Complete funnel - content to closed deal\n' +
      '4. ManyChat setup using trigger words Sam specified\n' +
      '5. 3 monetization strategies\n' +
      '6. Weekly KPIs\n' +
      '7. Objection map - top objections and how OTG should answer them\n' +
      '8. What NOT to do\n' +
      '9. Testing plan - how OTG should post 50-100 videos, identify winners, and double down on successful hooks and formats\n\n' +
      'End with [STRATEGY_COMPLETE].',

    luna: base + groundedResearch +
      'YOUR JOB - Qualify this as a lead opportunity for OTG Icon.\n\n' +
      'Analyze: service needed, likely budget, timeline, goal, fit score 1-10, recommended package, next step.\n' +
      'Write a warm personalized qualification response the OTG team can send.\n\n' +
      'End with [QUALIFIED].',

    rex: base + groundedResearch + context +
      'Do not repeat or summarize any prior agent output. Begin your proposal now.\n\n' +
      'YOUR JOB - Write a complete client proposal based on the qualification and research above.\n\n' +
      'Include: executive summary, understanding goals, recommended solution, 3 pricing tiers (good/better/best), our process, about OTG Icon, social proof, likely objections answered directly, next steps with deadline, payment options for packages over $2000, and a short follow-up plan.\n\n' +
      'End with [PROPOSAL_COMPLETE].',

    nova: base + groundedResearch + context +
      'Do not repeat or summarize any prior agent output. Begin your client plan now.\n\n' +
      'YOUR JOB - Build a complete client communication plan based on the proposal above.\n\n' +
      'Deliver: welcome message, onboarding sequence (Day 1/3/7/14/21), post-delivery sequence, retainer check-in schedule, upsell timing, review request template, referral request template, and risk flags to watch for during delivery.\n\n' +
      'End with [CLIENT_COMPLETE].',
  };

  const basePrompt = prompts[agentId] || base + context + 'Complete your role in this OTG Icon pipeline for topic: ' + topic;
  const handoffInstruction = STANDARD_HANDOFF_INSTRUCTIONS[agentId];
  return handoffInstruction ? basePrompt + '\n\n' + handoffInstruction : basePrompt;
}
