import { listAssets, getAsset } from './assets.js';
import { listScripts } from './contentRecords.js';
import { listCalendarEntries } from './contentCalendar.js';

function compact(value = '', max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stripOtgReferences(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => !/\botg\b|\botg icon\b/i.test(sentence))
    .filter((sentence) => !/\bwe\b.*\bdifferentiat|\bcompetitor|\bgap\b.*\bown\b/i.test(sentence));

  return sentences.join(' ').trim();
}

function parseStructuredTopicField(topic = '', label = '') {
  const match = String(topic || '').match(new RegExp(`${label}:\\s*(.+?)(?=\\s+[A-Z][a-z]+:|$)`, 'i'));
  return match ? match[1].trim() : '';
}

function firstNonEmpty(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(String(value || '').trim());
  });
}

function splitLines(value = '', limit = 4) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function ensureArray(value, limit = 4) {
  return (Array.isArray(value) ? value : [])
    .map((item) => compact(item, 160))
    .filter(Boolean)
    .slice(0, limit);
}

function pickLatestAsset(assetId = '') {
  if (assetId) return getAsset(assetId);
  return listAssets()
    .filter((asset) => asset?.outputs && Object.keys(asset.outputs).length > 0)
    .sort((a, b) => new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0))[0] || null;
}

function normalizeAlex(asset) {
  return asset?.outputs?.alex?.handoffJson || asset?.outputs?.alex?.output || null;
}

function normalizeJordan(asset) {
  return asset?.outputs?.jordan?.handoffJson || asset?.outputs?.jordan?.output || null;
}

function normalizeSam(asset) {
  return asset?.outputs?.sam?.handoffJson || asset?.outputs?.sam?.output || null;
}

function summarizeStrategyNotes(asset) {
  return [
    compact(stripOtgReferences(asset?.outputs?.alex?.narrativeSummary || ''), 500),
    compact(stripOtgReferences(asset?.outputs?.jordan?.narrativeSummary || ''), 500),
    compact(stripOtgReferences(asset?.outputs?.sam?.narrativeSummary || ''), 500),
  ].filter(Boolean).join('\n\n');
}

function inferHeadline({ niche = '', offerName = '', clientName = '', topic = '' } = {}) {
  const safeNiche = compact(niche, 120);
  const safeOffer = compact(offerName, 120);
  const safeClient = compact(clientName, 120);
  const parsedNiche = compact(parseStructuredTopicField(topic, 'Niche'), 120);
  const parsedOffer = compact(parseStructuredTopicField(topic, 'Primary offer'), 120);

  const subject = safeOffer || safeNiche || parsedOffer || parsedNiche || safeClient;
  if (!subject) return '';
  return `Turn ${subject} attention into qualified inquiries.`;
}

function inferSubheadline(topic = '', audience = '', insight = '') {
  const safeAudience = compact(audience, 120);
  const safeInsight = compact(stripOtgReferences(insight), 180);
  if (safeAudience && safeInsight) {
    return `Built for ${safeAudience.toLowerCase()} so the promise in the content becomes the promise on the page. ${safeInsight}`;
  }
  if (safeAudience) {
    return `Built for ${safeAudience.toLowerCase()} with a cleaner path from attention to a qualified next step.`;
  }
  if (safeInsight) return safeInsight;
  return '';
}

function buildBenefits(scripts = [], alexSummary = {}) {
  const bodyBullets = scripts.flatMap((script) => ensureArray(script.body_bullets, 6)).slice(0, 4);
  if (bodyBullets.length) return bodyBullets;

  const hooks = ensureArray(alexSummary?.top_hooks || alexSummary?.outputs?.top_hooks, 3);
  if (hooks.length) return hooks;

  const angles = ensureArray(alexSummary?.content_angles || alexSummary?.outputs?.content_angles, 3);
  if (angles.length) return angles;

  return [
    'Match the language in the content to the promise on the page',
    'Turn attention into a specific next step',
    'Use proof and positioning that feel native to the niche',
  ];
}

function buildProcess(asset, scripts = []) {
  const calendarEntry = listCalendarEntries({ asset_id: asset.id })[0] || null;
  const stages = [
    calendarEntry?.journey_stage ? `Map the buyer stage: ${calendarEntry.journey_stage}` : '',
    scripts[0]?.hook_text ? `Lead with the angle: ${compact(scripts[0].hook_text, 100)}` : '',
    calendarEntry?.cta_id ? `Route the click to CTA ${calendarEntry.cta_id}` : 'Move the visitor to one clear next step',
  ].filter(Boolean);
  return stages.length ? stages : [
    'Identify the exact buyer problem',
    'Match the page language to the content angle',
    'Move the click into one tracked CTA',
  ];
}

export function buildPageContext(assetId = '') {
  const asset = pickLatestAsset(assetId);
  if (!asset) return null;

  const scripts = listScripts({ asset_id: asset.id });
  const alex = normalizeAlex(asset);
  const jordan = normalizeJordan(asset);
  const sam = normalizeSam(asset);
  const calendarEntries = listCalendarEntries({ asset_id: asset.id });
  const calendar = calendarEntries[0] || null;

  const alexSummary = alex && typeof alex === 'object'
    ? (alex.summary || alex.outputs || alex)
    : {};
  const jordanSummary = jordan && typeof jordan === 'object'
    ? (jordan.summary || jordan.outputs || jordan)
    : {};
  const samSummary = sam && typeof sam === 'object'
    ? (sam.summary || sam.outputs || sam)
    : {};

  const niche = firstNonEmpty(
    alexSummary.niche,
    jordanSummary.niche,
    parseStructuredTopicField(asset.topic, 'Niche'),
    calendar?.topic,
    asset.topic,
  ) || '';
  const clientName = firstNonEmpty(
    parseStructuredTopicField(asset.topic, 'Client'),
    asset.clientName,
    asset.client_name,
  ) || '';
  const audience = firstNonEmpty(
    alexSummary.target_audience,
    jordanSummary.target_audience,
    jordanSummary.icp,
  ) || '';
  const ctaId = firstNonEmpty(
    calendar?.cta_id,
    scripts[0]?.cta_id,
    samSummary.cta_id,
    'cta_default',
  );
  const platforms = Array.isArray(calendar?.platforms) && calendar.platforms.length
    ? calendar.platforms
    : ensureArray(samSummary.platforms || alexSummary.platform || [], 4);
  const hook = firstNonEmpty(
    scripts[0]?.hook_text,
    calendar?.hook_text,
    compact(asset.outputs?.maya?.narrativeSummary || '', 120),
  ) || '';
  const keyInsight = firstNonEmpty(
    stripOtgReferences(alexSummary.key_insight),
    stripOtgReferences(jordanSummary.key_insight),
    compact(stripOtgReferences(asset.outputs?.jordan?.narrativeSummary || ''), 180),
  ) || '';
  const offerName = firstNonEmpty(
    jordanSummary.offer_name,
    samSummary.offer_name,
    parseStructuredTopicField(asset.topic, 'Primary offer'),
    niche ? `${niche} system` : '',
  ) || '';

  return {
    assetId: asset.id,
    topic: asset.topic,
    title: asset.title,
    pipelineType: asset.pipelineType,
    state: asset.state,
    clientName,
    clientId: scripts[0]?.client_id || calendar?.client_id || 'cli_default',
    campaignId: scripts[0]?.campaign_id || calendar?.campaign_id || 'cmp_default',
    offerId: 'off_default',
    offerName,
    niche,
    audience,
    platforms,
    ctaId,
    ctaKeyword: 'GUIDE',
    hook,
    headline: inferHeadline({ niche, offerName, clientName, topic: asset.topic }),
    subheadline: inferSubheadline(asset.topic, audience, keyInsight),
    benefits: buildBenefits(scripts, alexSummary),
    process: buildProcess(asset, scripts),
    strategyNotes: stripOtgReferences(summarizeStrategyNotes(asset)),
    sourcePrompt: [
      `Build a premium ${niche || offerName || clientName || 'service business'} landing page.`,
      audience ? `Target audience: ${audience}.` : '',
      keyInsight ? `Key insight: ${keyInsight}` : '',
      hook ? `Lead with this angle: ${hook}` : '',
      platforms.length ? `Primary platforms: ${platforms.join(', ')}.` : '',
    ].filter(Boolean).join(' '),
    scripts: scripts.map((script) => ({
      id: script.id,
      hook_text: script.hook_text,
      body_bullets: script.body_bullets || [],
      cta_id: script.cta_id,
      format: script.format,
    })),
    calendarEntries,
  };
}

export function buildGhlPageBrief(pageContext) {
  if (!pageContext) return null;
  return {
    title: pageContext.headline || pageContext.topic,
    subheadline: pageContext.subheadline || 'Move the content click into a qualified next step.',
    sectionHeadlines: [
      'Why this matters now',
      'What makes this different',
      'What happens next',
    ],
    benefitBullets: pageContext.benefits || [],
    processBullets: pageContext.process || [],
    cta: pageContext.ctaId,
    notes: compact(pageContext.strategyNotes, 1000),
    assetId: pageContext.assetId,
    clientId: pageContext.clientId,
    campaignId: pageContext.campaignId,
  };
}

export function buildClientOnboardingPacket(pageContext) {
  if (!pageContext) return null;

  return {
    research_packet_id: pageContext.assetId,
    niche: pageContext.niche || pageContext.topic || '',
    target_audience: pageContext.audience || '',
    primary_offer: pageContext.offerName || '',
    core_cta: pageContext.ctaId || '',
    brand_positioning: compact(stripOtgReferences(pageContext.subheadline || pageContext.strategyNotes || ''), 280),
    research_summary: compact(stripOtgReferences(pageContext.strategyNotes || pageContext.sourcePrompt || ''), 1200),
    onboarding_status: 'research_attached',
    onboarding_packet: {
      assetId: pageContext.assetId,
      topic: pageContext.topic,
      niche: pageContext.niche || '',
      audience: pageContext.audience || '',
      offerName: pageContext.offerName || '',
      ctaId: pageContext.ctaId || '',
      platforms: Array.isArray(pageContext.platforms) ? pageContext.platforms : [],
      headline: pageContext.headline || '',
      subheadline: pageContext.subheadline || '',
      benefits: Array.isArray(pageContext.benefits) ? pageContext.benefits : [],
      process: Array.isArray(pageContext.process) ? pageContext.process : [],
      strategyNotes: stripOtgReferences(pageContext.strategyNotes || ''),
      campaignId: pageContext.campaignId || '',
      clientId: pageContext.clientId || '',
      attachedAt: new Date().toISOString(),
    },
  };
}
