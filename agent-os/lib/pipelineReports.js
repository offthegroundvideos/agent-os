export const AGENT_META = {
  alex: { name: 'Alex', color: '#3b82f6', icon: 'ðŸ”', role: 'Research' },
  iris: { name: 'Iris', color: '#f97316', icon: 'ðŸ“¸', role: 'Production' },
  maya: { name: 'Maya', color: '#ec4899', icon: 'âœï¸', role: 'Scripts' },
  sam: { name: 'Sam', color: '#8b5cf6', icon: 'ðŸ“±', role: 'Social' },
  jordan: { name: 'Jordan', color: '#f59e0b', icon: 'ðŸ“ˆ', role: 'Strategy' },
  rex: { name: 'Rex', color: '#84cc16', icon: 'ðŸ’¼', role: 'Proposal' },
  luna: { name: 'Luna', color: '#06b6d4', icon: 'ðŸŽ¯', role: 'Leads' },
  dev: { name: 'Dev', color: '#10b981', icon: 'ðŸ’»', role: 'Tech' },
  nova: { name: 'Nova', color: '#e879f9', icon: 'ðŸŒŸ', role: 'Client Success' },
  pixel: { name: 'Pixel', color: '#f472b6', icon: 'ðŸŽ¨', role: 'Brand' },
};

export function parseTopicField(topic = '', label = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(topic || '').match(new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*(.+?)\\s*(?=\\n|$)`, 'i'));
  return match ? match[1].trim() : '';
}

export function normalizeAssets(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.assets)) return payload.assets;
  return [];
}

export function formatDate(value) {
  if (!value) return 'Unknown date';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function firstNonEmpty(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return Boolean(String(value || '').trim());
  });
}

export function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [value];
}

export function formatValue(value) {
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nested]) => `${key.replace(/_/g, ' ')}: ${formatValue(nested)}`)
      .filter(Boolean)
      .join(' â€¢ ');
  }
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function stripAgentPrefix(value = '') {
  return String(value || '')
    .trim()
    .replace(/^[A-Za-z0-9_-]+\s*:\s*/, '')
    .trim();
}

function stripCodeFence(value = '') {
  return String(value || '')
    .trim()
    .replace(/^```(?:json|md|markdown|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function parseStructuredOutput(value = '') {
  const candidates = uniqueStrings([
    String(value || '').trim(),
    stripCodeFence(value),
    stripAgentPrefix(value),
    stripCodeFence(stripAgentPrefix(value)),
  ]);

  for (const candidate of candidates) {
    if (!candidate || (!candidate.startsWith('{') && !candidate.startsWith('['))) continue;
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

function formatKeyLabel(key = '') {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function isRenderableValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some(isRenderableValue);
  if (typeof value === 'object') return Object.values(value).some(isRenderableValue);
  return String(value).replace(/\s+/g, ' ').trim().length > 0;
}

function normalizeStructuredPayload(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.outputs && typeof value.outputs === 'object' && !Array.isArray(value.outputs)) {
    return { ...value, ...value.outputs };
  }
  return value;
}

function pickField(source, ...keys) {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && isRenderableValue(source[key])) {
      return source[key];
    }
  }
  return '';
}

function appendDisplaySection(lines, title, value) {
  if (!isRenderableValue(value)) return;
  lines.push('');
  lines.push(title);
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    lines.push(...formatStructuredLines(value, 1));
    return;
  }
  lines.push(`  ${formatValue(value)}`);
}

function formatEvidenceRatio(row = {}) {
  const rawRatio = row.ratio ?? row.views_to_followers_ratio ?? row.view_to_follower_ratio ?? row.viewsFollowerRatio;
  if (rawRatio != null && String(rawRatio).trim() !== '') {
    const text = String(rawRatio).trim();
    return /x$/i.test(text) ? text : `${text}x`;
  }

  const followers = Number(row.followers ?? row.follower_count ?? row.followers_count);
  const views = Number(row.views ?? row.view_count ?? row.views_count);
  if (Number.isFinite(followers) && followers > 0 && Number.isFinite(views)) {
    return `${(views / followers).toFixed(1)}x`;
  }

  return '';
}

function getAlexEvidenceRowDetails(row = {}, index = 0) {
  const creator = row.creator || row.creator_name || row.handle || row.name || row.title || `Item ${index + 1}`;
  const platform = row.platform || row.platform_name || row.network || '';
  const followers = row.followers ?? row.follower_count ?? row.followers_count;
  const views = row.views ?? row.view_count ?? row.views_count;
  const ratio = formatEvidenceRatio(row);
  const postAge = row.post_age_days ?? row.post_age ?? row.age_days;
  const source = row.source_url || row.source || row.url || row.post_url || row.link || '';
  const confidence = row.confidence ?? row.confidence_score;
  const qualifies = row.qualifies_5x ?? row.qualifies ?? row.passes_rule;
  const note = row.note || row.notes || row.reason || row.evidence_note || '';
  const qualifiesValue = qualifies === true
    || qualifies === 1
    || String(qualifies).trim().toLowerCase() === 'true'
    || String(qualifies).trim() === '1';

  return {
    creator,
    platform,
    followers,
    views,
    ratio,
    postAge,
    source,
    confidence,
    qualifies,
    qualifiesValue,
    badge: qualifies == null || String(qualifies).trim() === '' ? '[5X ?]' : (qualifiesValue ? '[5X PASS]' : '[5X FAIL]'),
    note,
  };
}

function formatAlexEvidenceTable(rows = [], indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);

  return rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object') {
      return [`${indent}- ${formatValue(row)}`];
    }

    const details = getAlexEvidenceRowDetails(row, index);
    const summary = [];

    if (details.followers != null && String(details.followers).trim() !== '') summary.push(`Followers: ${formatValue(details.followers)}`);
    if (details.views != null && String(details.views).trim() !== '') summary.push(`Views: ${formatValue(details.views)}`);
    if (details.ratio) summary.push(`Ratio: ${details.ratio}`);
    if (details.postAge != null && String(details.postAge).trim() !== '') {
      const postAgeText = String(details.postAge).trim();
      summary.push(`Post age: ${/^\d+(\.\d+)?$/.test(postAgeText) ? `${postAgeText} days` : postAgeText}`);
    }
    if (details.confidence != null && String(details.confidence).trim() !== '') summary.push(`Confidence: ${formatValue(details.confidence)}`);
    if (details.source) summary.push(`Source: ${formatValue(details.source)}`);
    if (details.note) summary.push(`Note: ${formatValue(details.note)}`);

    return [
      `${indent}- ${details.creator}${details.platform ? ` (${details.platform})` : ''} ${details.badge}`,
      ...summary.map((line) => `${indent}  - ${line}`),
    ];
  });
}

function formatStructuredLines(value, indentLevel = 0) {
  const indent = '  '.repeat(indentLevel);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (item && typeof item === 'object') {
        const shotNumber = item.shot_number || item.day || item.step || index + 1;
        const label = item.type || item.name || item.title || `Item ${index + 1}`;
        const summary = Object.entries(item)
          .filter(([key]) => !['shot_number', 'day', 'step', 'type', 'name', 'title'].includes(key))
          .map(([key, nested]) => `${formatKeyLabel(key)}: ${formatValue(nested)}`)
          .filter(Boolean);
        return [
          `${indent}- ${shotNumber ? `${shotNumber}. ` : ''}${label}`.trim(),
          ...summary.map((line) => `${indent}  - ${line}`),
        ];
      }
      return [`${indent}- ${formatValue(item)}`];
    });
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) => {
      if (nested == null || nested === '') return [];
      const label = formatKeyLabel(key);
      if (Array.isArray(nested) || (nested && typeof nested === 'object')) {
        return [`${indent}${label}:`, ...formatStructuredLines(nested, indentLevel + 1)];
      }
      return [`${indent}${label}: ${formatValue(nested)}`];
    });
  }

  return [`${indent}${formatValue(value)}`];
}

export function formatAgentOutputForDisplay(agentId, rawOutput = '') {
  const text = stripCodeFence(stripAgentPrefix(rawOutput));
  if (!text.trim()) return '';

  const parsed = parseStructuredOutput(text);
  if (!parsed) return text;

  const data = normalizeStructuredPayload(parsed);

  if (agentId === 'iris') {
    const outputs = data?.outputs && typeof data.outputs === 'object' && !Array.isArray(data.outputs)
      ? data.outputs
      : data;
    const lines = [];

    if (data.task_name) lines.push(`Task: ${formatValue(data.task_name)}`);
    if (data.asset_id) lines.push(`Asset: ${formatValue(data.asset_id)}`);
    if (Array.isArray(data.source_inputs) && data.source_inputs.length) {
      lines.push('');
      lines.push('Source Inputs');
      lines.push(...formatStructuredLines(data.source_inputs, 1));
    }

    if (outputs.visual_thesis) {
      lines.push('');
      lines.push('Visual Thesis');
      lines.push(`  ${formatValue(outputs.visual_thesis)}`);
    }

    if (outputs.hero_direction && typeof outputs.hero_direction === 'object') {
      lines.push('');
      lines.push('Hero Direction');
      lines.push(...formatStructuredLines(outputs.hero_direction, 1));
    }

    if (Array.isArray(outputs.shot_list) && outputs.shot_list.length) {
      lines.push('');
      lines.push('Shot List');
      outputs.shot_list.forEach((shot, index) => {
        const shotNumber = shot?.shot_number || index + 1;
        const summary = [
          shot?.type ? shot.type : 'Shot',
          shot?.lens ? `Lens: ${shot.lens}` : '',
          shot?.lighting_setup ? `Lighting: ${shot.lighting_setup}` : '',
        ].filter(Boolean).join(' | ');
        lines.push(`  - Shot ${shotNumber}: ${summary}`);
      });
    }

    if (outputs.production_schedule && typeof outputs.production_schedule === 'object') {
      lines.push('');
      lines.push('Production Schedule');
      lines.push(...formatStructuredLines(outputs.production_schedule, 1));
    }

    if (outputs.equipment && typeof outputs.equipment === 'object') {
      lines.push('');
      lines.push('Equipment');
      lines.push(...formatStructuredLines(outputs.equipment, 1));
    }

    if (outputs.client_prep && typeof outputs.client_prep === 'object') {
      lines.push('');
      lines.push('Client Prep');
      lines.push(...formatStructuredLines(outputs.client_prep, 1));
    }

    if (outputs.post_notes && typeof outputs.post_notes === 'object') {
      lines.push('');
      lines.push('Post Notes');
      lines.push(...formatStructuredLines(outputs.post_notes, 1));
    }

    if (outputs.team_assignments && typeof outputs.team_assignments === 'object') {
      lines.push('');
      lines.push('Team Assignments');
      lines.push(...formatStructuredLines(outputs.team_assignments, 1));
    }

    if (data.confidence != null) {
      lines.push('');
      lines.push(`Confidence: ${formatValue(data.confidence)}`);
    }

    if (data.recommended_next_step) {
      lines.push('');
      lines.push(`Recommended Next Step: ${formatValue(data.recommended_next_step)}`);
    }

    return lines.filter(Boolean).join('\n').trim();
  }

  const lines = [];

  if (agentId === 'alex') {
    appendDisplaySection(lines, 'Research Snapshot', {
      niche: pickField(data, 'niche'),
      platform: pickField(data, 'platform', 'platforms'),
      target_audience: pickField(data, 'target_audience'),
      key_insight: pickField(data, 'key_insight'),
    });
    const evidenceTable = toArray(pickField(data, 'evidence_table'));
    if (evidenceTable.length) {
      lines.push('');
      lines.push('Evidence Table');
      lines.push(...formatAlexEvidenceTable(evidenceTable, 1));
    }
    appendDisplaySection(lines, 'Viral Content', {
      top_hooks: pickField(data, 'top_hooks'),
      viral_formats: pickField(data, 'viral_formats'),
      hook_patterns: pickField(data, 'hook_patterns'),
      format_breakdown: pickField(data, 'format_breakdown'),
    });
    appendDisplaySection(lines, 'Lead Opportunities', {
      lead_sources: pickField(data, 'lead_sources'),
      lead_opportunities: pickField(data, 'lead_opportunities'),
    });
    appendDisplaySection(lines, 'Competitor Gaps', pickField(data, 'competitor_gaps'));
    appendDisplaySection(lines, 'Recommended Angles', pickField(data, 'content_angles', 'recommended_angles'));
    appendDisplaySection(lines, 'Recommended Next Step', pickField(data, 'recommended_next_step', 'next_step'));
    return lines.filter(Boolean).join('\n').trim();
  }

  if (agentId === 'maya') {
    appendDisplaySection(lines, 'Creative Brief', {
      scripts_written: pickField(data, 'scripts_written'),
      primary_hook_style: pickField(data, 'primary_hook_style'),
      formats_used: pickField(data, 'formats_used', 'formats'),
      cta_trigger_word: pickField(data, 'cta_trigger_word'),
      key_themes: pickField(data, 'key_themes'),
      best_script_index: pickField(data, 'best_script_index'),
    });
    appendDisplaySection(lines, 'Scripts', pickField(data, 'scripts', 'script', 'script_variants', 'script_pack'));
    appendDisplaySection(lines, 'Hook Build', {
      visual_hook: pickField(data, 'visual_hook'),
      written_hook: pickField(data, 'written_hook'),
      verbal_hook: pickField(data, 'verbal_hook'),
    });
    appendDisplaySection(lines, 'Notes', pickField(data, 'notes', 'filming_notes', 'production_notes'));
    appendDisplaySection(lines, 'Recommended Next Step', pickField(data, 'recommended_next_step'));
    return lines.filter(Boolean).join('\n').trim();
  }

  if (agentId === 'sam') {
    appendDisplaySection(lines, 'Publishing Plan', {
      total_posts: pickField(data, 'total_posts'),
      posting_frequency: pickField(data, 'posting_frequency'),
      platforms: pickField(data, 'platforms'),
      top_content_type: pickField(data, 'top_content_type'),
    });
    appendDisplaySection(lines, 'Calendar and Cadence', pickField(data, 'content_calendar', 'calendar', 'schedule'));
    appendDisplaySection(lines, 'Trigger Words', pickField(data, 'manychat_triggers', 'manychat_trigger'));
    appendDisplaySection(lines, 'Production Needs', {
      shoot_days_needed: pickField(data, 'shoot_days_needed'),
      editors_needed: pickField(data, 'editors_needed'),
    });
    appendDisplaySection(lines, 'Hashtag Strategy', pickField(data, 'hashtag_strategy', 'hashtags'));
    appendDisplaySection(lines, 'Recommended Next Step', pickField(data, 'recommended_next_step'));
    return lines.filter(Boolean).join('\n').trim();
  }

  if (agentId === 'jordan') {
    appendDisplaySection(lines, 'Growth Plan', {
      primary_channel: pickField(data, 'primary_channel'),
      primary_offer: pickField(data, 'primary_offer', 'offer_name'),
      target_audience: pickField(data, 'target_audience', 'icp'),
      key_insight: pickField(data, 'key_insight'),
    });
    appendDisplaySection(lines, 'Funnel Steps', pickField(data, 'funnel_steps', 'funnel'));
    appendDisplaySection(lines, 'Lead Magnet', pickField(data, 'lead_magnet'));
    appendDisplaySection(lines, 'Trigger', pickField(data, 'manychat_trigger'));
    appendDisplaySection(lines, 'Milestones', {
      '30_day_goal': pickField(data, '30_day_goal', 'thirty_day_goal'),
      '60_day_goal': pickField(data, '60_day_goal', 'sixty_day_goal'),
      '90_day_goal': pickField(data, '90_day_goal', 'ninety_day_goal'),
    });
    appendDisplaySection(lines, 'KPIs', pickField(data, 'kpis'));
    appendDisplaySection(lines, 'Monetization Ideas', pickField(data, 'monetization_ideas'));
    appendDisplaySection(lines, 'What Not To Do', pickField(data, 'what_not_to_do', 'donts', 'avoid'));
    appendDisplaySection(lines, 'Recommended Next Step', pickField(data, 'recommended_next_step'));
    return lines.filter(Boolean).join('\n').trim();
  }

  if (agentId === 'rex') {
    appendDisplaySection(lines, 'Proposal Snapshot', {
      proposal_summary: pickField(data, 'proposal_summary', 'summary'),
      pricing: pickField(data, 'pricing'),
      next_step: pickField(data, 'next_step', 'recommended_next_step'),
    });
    appendDisplaySection(lines, 'Deliverables', pickField(data, 'deliverables', 'what_is_included'));
    appendDisplaySection(lines, 'Follow-Up', pickField(data, 'follow_up_sequence', 'follow_up'));
    appendDisplaySection(lines, 'Objection Handling', pickField(data, 'objection_handling'));
    return lines.filter(Boolean).join('\n').trim();
  }

  return formatStructuredLines(data).join('\n').trim();
}

export function sanitizeClientFacingText(value = '') {
  return String(value || '')
    .replace(/\bOTG Icon\b/gi, 'your brand')
    .replace(/\bOTG\b/gi, 'your brand')
    .replace(/\bManyChat\b/gi, 'automated follow-up')
    .replace(/\bgo-to-market\b/gi, 'growth plan')
    .replace(/\bCTA\b/g, 'call to action')
    .replace(/\bicp\b/gi, 'ideal customer profile')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueStrings(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function extractFormatsFromText(text = '') {
  return uniqueStrings(Array.from(String(text || '').matchAll(/\*\*FORMAT\*\*:\s*([^\n]+)/g)).map((match) => match[1].trim())).slice(0, 6);
}

export function extractScriptCount(text = '') {
  const matches = String(text || '').match(/\*\*Script\s+\d+\*\*/gi);
  return matches ? matches.length : 0;
}

export function extractDaySchedule(text = '') {
  return uniqueStrings(
    Array.from(String(text || '').matchAll(/\*\*Day\s+\d+.*$/gim)).map((match) => match[0].replace(/\*/g, '').trim())
  ).slice(0, 6);
}

function summarizeAgentPayload(agentId, payload, rawOutput = '') {
  const data = normalizeStructuredPayload(payload || {});

  if (agentId === 'alex') {
    const evidenceRows = toArray(data.evidence_table);
    const bestEvidence = evidenceRows.reduce((best, row) => {
      const bestScore = Number.parseFloat(getAlexEvidenceRowDetails(best).ratio) || 0;
      const rowScore = Number.parseFloat(getAlexEvidenceRowDetails(row).ratio) || 0;
      return rowScore > bestScore ? row : best;
    }, null);
    const bestEvidenceDetails = bestEvidence ? getAlexEvidenceRowDetails(bestEvidence) : null;
    return uniqueStrings([
      data.niche ? `Niche focus: ${formatValue(data.niche)}` : '',
      toArray(data.platform || data.platforms).length ? `Target platforms: ${formatValue(toArray(data.platform || data.platforms).slice(0, 3))}` : '',
      data.target_audience ? `Audience: ${formatValue(data.target_audience)}` : '',
      data.key_insight ? `Key insight: ${formatValue(data.key_insight)}` : '',
      evidenceRows.length ? `Evidence rows: ${evidenceRows.length}` : '',
      bestEvidenceDetails ? `Top evidence: ${formatValue(bestEvidenceDetails.creator)} (${formatValue(bestEvidenceDetails.platform || 'platform')}, ${bestEvidenceDetails.ratio || 'n/a'}) ${bestEvidenceDetails.badge}` : '',
      toArray(data.top_hooks).length ? `Top hooks: ${formatValue(toArray(data.top_hooks).slice(0, 3))}` : '',
      toArray(data.viral_formats).length ? `Winning formats: ${formatValue(toArray(data.viral_formats).slice(0, 3))}` : '',
      toArray(data.content_angles).length ? `Content angles: ${formatValue(toArray(data.content_angles).slice(0, 3))}` : '',
      toArray(data.lead_sources || data.lead_opportunities).length ? `Lead sources: ${formatValue(toArray(data.lead_sources || data.lead_opportunities).slice(0, 3))}` : '',
    ]).slice(0, 8);
  }

  if (agentId === 'maya') {
    const formats = uniqueStrings([
      ...toArray(data.formats_used || data.formats),
      ...extractFormatsFromText(rawOutput),
    ]);
    const scriptCount = Number(data.scripts_written) || extractScriptCount(rawOutput) || toArray(data.scripts).length;
    return uniqueStrings([
      scriptCount ? `Scripts drafted: ${scriptCount}` : '',
      data.primary_hook_style ? `Primary hook style: ${formatValue(data.primary_hook_style)}` : '',
      formats.length ? `Formats covered: ${formats.slice(0, 4).join(', ')}` : '',
      data.cta_trigger_word ? `CTA trigger: ${formatValue(data.cta_trigger_word)}` : '',
      data.manychat_trigger ? `ManyChat trigger: ${formatValue(data.manychat_trigger)}` : '',
      toArray(data.key_themes).length ? `Key themes: ${formatValue(toArray(data.key_themes).slice(0, 4))}` : '',
      data.best_script_index != null ? `Best script index: ${formatValue(data.best_script_index)}` : '',
      rawOutput.includes('VISUAL HOOK') ? 'Scripts include visual hooks to stop the scroll.' : '',
    ]).slice(0, 6);
  }

  if (agentId === 'sam') {
    return uniqueStrings([
      data.total_posts ? `Posting volume: ${formatValue(data.total_posts)} planned posts` : '',
      data.posting_frequency ? `Publishing cadence: ${formatValue(data.posting_frequency)}` : '',
      toArray(data.platforms).length ? `Publishing platforms: ${formatValue(toArray(data.platforms).slice(0, 5))}` : '',
      data.top_content_type ? `Top content type: ${formatValue(data.top_content_type)}` : '',
      toArray(data.manychat_triggers || data.manychat_trigger).length ? `Reply triggers: ${formatValue(toArray(data.manychat_triggers || data.manychat_trigger).slice(0, 5))}` : '',
      data.shoot_days_needed ? `Shoot days needed: ${formatValue(data.shoot_days_needed)}` : '',
      toArray(data.editors_needed).length ? `Editors needed: ${formatValue(toArray(data.editors_needed).slice(0, 3))}` : '',
      extractDaySchedule(rawOutput).length ? `Scheduled drops: ${extractDaySchedule(rawOutput).slice(0, 3).join(' | ')}` : '',
    ]).slice(0, 6);
  }

  if (agentId === 'jordan') {
    return uniqueStrings([
      data.primary_channel ? `Primary channel: ${formatValue(data.primary_channel)}` : '',
      data.primary_offer || data.offer_name ? `Primary offer: ${formatValue(data.primary_offer || data.offer_name)}` : '',
      data.target_audience || data.icp ? `Audience: ${formatValue(data.target_audience || data.icp)}` : '',
      toArray(data.funnel_steps).length ? `Funnel steps: ${formatValue(toArray(data.funnel_steps).slice(0, 4))}` : '',
      data.lead_magnet ? `Lead magnet: ${formatValue(data.lead_magnet)}` : '',
      data.manychat_trigger ? `Trigger: ${formatValue(data.manychat_trigger)}` : '',
      data['30_day_goal'] ? `30-day goal: ${formatValue(data['30_day_goal'])}` : '',
      data['60_day_goal'] ? `60-day goal: ${formatValue(data['60_day_goal'])}` : '',
      data['90_day_goal'] ? `90-day goal: ${formatValue(data['90_day_goal'])}` : '',
      toArray(data.kpis).length ? `KPIs: ${formatValue(toArray(data.kpis).slice(0, 4))}` : '',
      toArray(data.monetization_ideas).length ? `Monetization ideas: ${formatValue(toArray(data.monetization_ideas).slice(0, 3))}` : '',
      toArray(data.what_not_to_do || data.donts || data.avoid).length ? `What not to do: ${formatValue(toArray(data.what_not_to_do || data.donts || data.avoid).slice(0, 3))}` : '',
    ]).slice(0, 6);
  }

  if (agentId === 'iris') {
    return uniqueStrings([
      data.visual_thesis ? `Visual direction: ${formatValue(data.visual_thesis)}` : '',
      toArray(data.shot_list).length ? `Shot list: ${toArray(data.shot_list).length} planned shots` : '',
      toArray(data.production_schedule).length ? `Production schedule: ${toArray(data.production_schedule).length} planned blocks` : '',
      data.equipment ? `Equipment: ${formatValue(data.equipment)}` : '',
      data.team_assignments ? `Team assignments: ${formatValue(data.team_assignments)}` : '',
    ]).slice(0, 6);
  }

  if (agentId === 'rex') {
    return uniqueStrings([
      data.proposal_summary ? `Proposal summary: ${formatValue(data.proposal_summary)}` : '',
      data.pricing ? `Pricing: ${formatValue(data.pricing)}` : '',
      data.next_step ? `Sales next step: ${formatValue(data.next_step)}` : '',
      toArray(data.deliverables || data.what_is_included).length ? `Included deliverables: ${formatValue(toArray(data.deliverables || data.what_is_included).slice(0, 4))}` : '',
      toArray(data.follow_up_sequence || data.follow_up).length ? `Follow-up sequence: ${formatValue(toArray(data.follow_up_sequence || data.follow_up).slice(0, 4))}` : '',
      rawOutput.includes('Pricing Tiers') ? 'Proposal includes pricing tiers for packaging.' : '',
      rawOutput.includes('Executive Summary') ? 'Proposal includes an executive summary for the client.' : '',
    ]).slice(0, 6);
  }

  return uniqueStrings([
    data.summary ? `Summary: ${formatValue(data.summary)}` : '',
    data.recommended_next_step ? `Next step: ${formatValue(data.recommended_next_step)}` : '',
    toArray(data.open_issues).length ? `Open issues: ${formatValue(data.open_issues)}` : '',
  ]).slice(0, 5);
}

export function summarizeHandoff(agentId, handoffJson, rawOutput = '') {
  return summarizeAgentPayload(agentId, handoffJson, rawOutput);
}

export function summarizeRawOutput(agentId, rawOutput = '') {
  const text = String(rawOutput || '');
  if (!text.trim()) return [];

  const parsed = parseStructuredOutput(text);
  if (parsed) {
    return summarizeAgentPayload(agentId, parsed, text);
  }

  if (agentId === 'maya') {
    const formats = extractFormatsFromText(text);
    const scriptCount = extractScriptCount(text);
    return uniqueStrings([
      scriptCount ? `Scripts drafted: ${scriptCount}` : '',
      formats.length ? `Formats covered: ${formats.join(', ')}` : '',
      text.includes('ManyChat') ? 'Includes CTA triggers for comments or DMs.' : '',
    ]).slice(0, 5);
  }

  if (agentId === 'sam') {
    return uniqueStrings([
      extractDaySchedule(text).length ? `Schedule highlights: ${extractDaySchedule(text).slice(0, 3).join(' | ')}` : '',
      text.includes('30-Day Posting Calendar') ? 'Built a 30-day posting calendar.' : '',
      text.includes('ManyChat Trigger') ? 'Includes response trigger ideas for social posts.' : '',
    ]).slice(0, 5);
  }

  const lines = text
    .split('\n')
    .map((line) => line.replace(/^[-*#\s]+/, '').trim())
    .filter(Boolean)
    .filter((line) => line.length > 24)
    .slice(0, 5);

  return uniqueStrings(lines);
}
export function buildAgentSummaries(asset) {
  return Object.entries(asset?.outputs || {})
    .map(([agentId, record]) => {
      const meta = AGENT_META[agentId] || { name: agentId, color: '#999', icon: 'â€¢', role: 'Agent' };
      const rawOutput = record?.output || '';
      const bullets = record?.handoffJson
        ? summarizeHandoff(agentId, record.handoffJson, rawOutput)
        : summarizeRawOutput(agentId, rawOutput);
      return {
        agentId,
        ...meta,
        output: formatAgentOutputForDisplay(agentId, rawOutput),
        rawOutput,
        handoffJson: record?.handoffJson || null,
        bullets,
      };
    })
    .filter((entry) => entry.output || entry.bullets.length);
}

export function buildSummaryDocument(asset, agentSummaries) {
  const clientName = parseTopicField(asset?.topic, 'Client');
  const niche = parseTopicField(asset?.topic, 'Niche');
  const offer = parseTopicField(asset?.topic, 'Primary offer');
  const platforms = parseTopicField(asset?.topic, 'Priority platforms');

  const overview = uniqueStrings([
    clientName ? `Client: ${clientName}` : '',
    niche ? `Niche: ${niche}` : '',
    offer ? `Offer: ${offer}` : '',
    platforms ? `Target platforms: ${platforms}` : '',
    asset?.pipelineType ? `Pipeline type: ${asset.pipelineType}` : '',
  ]);

  const actionItems = uniqueStrings(
    agentSummaries.flatMap((summary) =>
      summary.bullets.map((bullet) => `${summary.name}: ${bullet}`)
    )
  );

  return { overview, actionItems };
}

export function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'pipeline-report';
}

export function buildClientReportMarkdown(asset, summaryDocument, agentSummaries) {
  const clientName = parseTopicField(asset?.topic, 'Client') || asset?.title || 'Client';
  const niche = parseTopicField(asset?.topic, 'Niche');
  const offer = parseTopicField(asset?.topic, 'Primary offer');
  const audience = parseTopicField(asset?.topic, 'Target audience');
  const geography = parseTopicField(asset?.topic, 'Service area or geography');
  const platforms = parseTopicField(asset?.topic, 'Priority platforms');
  const research = agentSummaries.find((summary) => summary.agentId === 'alex');
  const scripts = agentSummaries.find((summary) => summary.agentId === 'maya');
  const social = agentSummaries.find((summary) => summary.agentId === 'sam');
  const strategy = agentSummaries.find((summary) => summary.agentId === 'jordan');
  const production = agentSummaries.find((summary) => summary.agentId === 'iris');

  const executiveSummary = sanitizeClientFacingText(firstNonEmpty(
    research?.handoffJson?.summary,
    strategy?.handoffJson?.summary,
    research?.bullets?.[0],
    summaryDocument.actionItems?.[0],
  ) || 'This report captures the strongest opportunities, content directions, and execution priorities identified in this run.');

  const strategyHighlights = uniqueStrings([
    ...toArray(research?.bullets).slice(0, 3).map(sanitizeClientFacingText),
    ...toArray(strategy?.bullets).slice(0, 3).map(sanitizeClientFacingText),
  ]).slice(0, 6);

  const contentPlan = uniqueStrings([
    ...toArray(scripts?.bullets).slice(0, 4).map(sanitizeClientFacingText),
    ...toArray(social?.bullets).slice(0, 4).map(sanitizeClientFacingText),
  ]).slice(0, 8);

  const productionNotes = uniqueStrings(
    toArray(production?.bullets).slice(0, 5).map(sanitizeClientFacingText)
  );

  const nextSteps = uniqueStrings(
    summaryDocument.actionItems.map(sanitizeClientFacingText)
  ).slice(0, 10);

  const lines = [
    `# ${clientName} Strategy Report`,
    '',
    '## Executive Summary',
    executiveSummary,
    '',
    '## Business Context',
    ...(niche ? [`- Niche: ${sanitizeClientFacingText(niche)}`] : []),
    ...(offer ? [`- Primary offer: ${sanitizeClientFacingText(offer)}`] : []),
    ...(audience ? [`- Target audience: ${sanitizeClientFacingText(audience)}`] : []),
    ...(geography ? [`- Geography: ${sanitizeClientFacingText(geography)}`] : []),
    ...(platforms ? [`- Priority platforms: ${sanitizeClientFacingText(platforms)}`] : []),
    '',
    '## Strategic Priorities',
    ...(strategyHighlights.length
      ? strategyHighlights.map((item) => `- ${item}`)
      : ['- Strategic priorities were not extracted from this run.']),
    '',
    '## Content Plan',
    ...(contentPlan.length
      ? contentPlan.map((item) => `- ${item}`)
      : ['- A content plan was not extracted from this run.']),
  ];

  if (productionNotes.length) {
    lines.push('');
    lines.push('## Production Notes');
    productionNotes.forEach((item) => lines.push(`- ${item}`));
  }

  lines.push('');
  lines.push('## Recommended Next Steps');
  (nextSteps.length ? nextSteps : ['Review the strategy, prioritize the best content angles, and move into execution.'])
    .forEach((item) => lines.push(`- ${item}`));

  lines.push('');
  lines.push('## Deliverable Notes');
  lines.push('- This report is a client-facing summary generated from the full pipeline run.');
  lines.push('- A full internal run export is available separately if detailed agent-by-agent output is needed.');

  return lines.join('\n');
}

export function buildFullReportMarkdown(asset, summaryDocument, agentSummaries) {
  const clientName = parseTopicField(asset?.topic, 'Client') || asset?.title || 'Client';
  const lines = [
    `# ${clientName} Full Pipeline Report`,
    '',
    '## Source Topic',
    asset?.topic || '',
    '',
    '## Summary Document',
    ...summaryDocument.overview.map((item) => `- ${item}`),
    '',
    '## Action Items',
    ...(summaryDocument.actionItems.length
      ? summaryDocument.actionItems.map((item) => `- ${item}`)
      : ['- No structured action items were extracted from this run.']),
  ];

  agentSummaries.forEach((summary) => {
    lines.push('');
    lines.push(`## ${summary.name} - ${summary.role}`);
    if (summary.bullets.length) {
      lines.push('');
      lines.push('### Highlights');
      summary.bullets.forEach((bullet) => lines.push(`- ${bullet}`));
    }
    lines.push('');
    lines.push('### Full Output');
    lines.push(summary.output || 'No output saved for this agent.');
  });

  return lines.join('\n');
}

