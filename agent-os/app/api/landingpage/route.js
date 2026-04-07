import { saveToWorkspace } from '../../../lib/memory.js';
import { addLandingPage } from '../../../lib/funnelRecords.js';
import { OLLAMA_URL } from '../../../lib/agents.js';
import { buildPageContext, buildGhlPageBrief } from '../../../lib/pageContext.js';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const THEME_PRESETS = {
  cinematic: {
    accent: '#ff7a18',
    bg: '#0b0a09',
    bgAlt: '#15110d',
    surface: 'rgba(24,18,13,0.82)',
    text: '#f7efe5',
    muted: '#b49d87',
    line: 'rgba(255,255,255,0.1)',
    heroImage: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80',
    fonts: 'family=Manrope:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@500;600;700',
    displayFont: "'Cormorant Garamond', serif",
    bodyFont: "'Manrope', sans-serif",
  },
  editorial: {
    accent: '#1c78ff',
    bg: '#f4efe7',
    bgAlt: '#fffaf3',
    surface: 'rgba(255,251,244,0.82)',
    text: '#111111',
    muted: '#655c53',
    line: 'rgba(17,17,17,0.12)',
    heroImage: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80',
    fonts: 'family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800',
    displayFont: "'Playfair Display', serif",
    bodyFont: "'Inter', sans-serif",
  },
  studio: {
    accent: '#12d6a0',
    bg: '#07120f',
    bgAlt: '#0c1d18',
    surface: 'rgba(12,29,24,0.84)',
    text: '#edf9f4',
    muted: '#93b5a8',
    line: 'rgba(255,255,255,0.1)',
    heroImage: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80',
    fonts: 'family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700',
    displayFont: "'Space Grotesk', sans-serif",
    bodyFont: "'Manrope', sans-serif",
  },
  minimal: {
    accent: '#ef4444',
    bg: '#faf7f2',
    bgAlt: '#ffffff',
    surface: 'rgba(255,255,255,0.92)',
    text: '#141414',
    muted: '#6a6a6a',
    line: 'rgba(20,20,20,0.1)',
    heroImage: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1400&q=80',
    fonts: 'family=Inter:wght@400;500;600;700;800&family=DM+Serif+Display:ital@0;1',
    displayFont: "'DM Serif Display', serif",
    bodyFont: "'Inter', sans-serif",
  },
};

const IMAGE_LIBRARY = {
  pet: {
    heroImage: 'https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1400&q=80',
  },
  wedding: {
    heroImage: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1400&q=80',
  },
  fitness: {
    heroImage: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1400&q=80',
  },
  beauty: {
    heroImage: 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1400&q=80',
  },
  home: {
    heroImage: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80',
  },
  realEstate: {
    heroImage: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=1400&q=80',
  },
  medical: {
    heroImage: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1400&q=80',
  },
  restaurant: {
    heroImage: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1400&q=80',
  },
  creator: {
    heroImage: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80',
  },
  business: {
    heroImage: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80',
  },
  neutral: {
    heroImage: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
    detailImage: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80',
  },
};

function matchesAny(text, patterns = []) {
  return patterns.some((pattern) => text.includes(pattern));
}

function resolveImageCategory(input) {
  const primaryText = [
    input.niche,
    input.clientName,
    input.headline,
    input.subheadline,
    input.offerName,
  ].join(' ').toLowerCase();

  const secondaryText = [
    input.sourcePrompt,
    input.strategyNotes,
    input.visualTheme,
  ].join(' ').toLowerCase();

  const rules = [
    { key: 'pet', patterns: ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'obedience', 'reactive dog', 'pet training', 'pet', 'dog trainer'] },
    { key: 'wedding', patterns: ['wedding', 'weddings', 'bride', 'groom', 'engagement', 'elopement'] },
    { key: 'beauty', patterns: ['beauty', 'esthetician', 'esthetics', 'lashes', 'brow', 'hair salon', 'salon', 'skincare', 'med spa', 'spa'] },
    { key: 'fitness', patterns: ['fitness', 'gym', 'workout', 'personal trainer', 'strength coach', 'nutrition coach'] },
    { key: 'home', patterns: ['hvac', 'roofing', 'roofer', 'plumbing', 'plumber', 'electrician', 'landscaping', 'landscape', 'contractor', 'remodel', 'home service'] },
    { key: 'realEstate', patterns: ['real estate', 'realtor', 'homes', 'buyers', 'sellers', 'property'] },
    { key: 'medical', patterns: ['dentist', 'dental', 'orthodont', 'chiropr', 'doctor', 'clinic', 'therapy', 'therapist', 'medical'] },
    { key: 'restaurant', patterns: ['restaurant', 'cafe', 'bakery', 'chef', 'food', 'menu', 'bar', 'hospitality'] },
    { key: 'creator', patterns: ['photography', 'videography', 'content creator', 'podcast', 'brand studio', 'creative agency', 'marketing agency', 'creator'] },
    { key: 'business', patterns: ['consulting', 'consultant', 'coach', 'agency', 'service business', 'founder', 'sales', 'growth'] },
  ];

  const primaryMatch = rules.find((rule) => matchesAny(primaryText, rule.patterns));
  if (primaryMatch) return primaryMatch.key;

  const secondaryMatch = rules.find((rule) => matchesAny(secondaryText, rule.patterns));
  if (secondaryMatch) return secondaryMatch.key;

  return 'neutral';
}

function resolveThemeImages(input, themeKey) {
  const categoryKey = resolveImageCategory(input);
  const categoryImages = IMAGE_LIBRARY[categoryKey] || IMAGE_LIBRARY.neutral;
  const themePreset = THEME_PRESETS[themeKey] || THEME_PRESETS.studio;

  return {
    heroImage: categoryImages.heroImage || themePreset.heroImage,
    detailImage: categoryImages.detailImage || themePreset.detailImage,
    categoryKey,
  };
}

function toSlug(value = 'landing-page') {
  return String(value || 'landing-page')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'landing-page';
}

function splitLines(value = '', limit = 6) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function clampItems(items = [], limit = 6) {
  return (Array.isArray(items) ? items : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function inferTheme(input) {
  const joined = [
    input.visualTheme,
    input.sourcePrompt,
    input.strategyNotes,
    input.niche,
    input.clientName,
  ].join(' ').toLowerCase();

  if (joined.includes('luxury') || joined.includes('romantic') || joined.includes('cinematic') || joined.includes('wedding')) return 'cinematic';
  if (joined.includes('editorial') || joined.includes('magazine') || joined.includes('modern classic')) return 'editorial';
  if (joined.includes('studio') || joined.includes('tech') || joined.includes('system') || joined.includes('founder')) return 'studio';
  if (joined.includes('minimal') || joined.includes('clean') || joined.includes('quiet')) return 'minimal';
  return 'studio';
}

function defaultObjectionItems(input) {
  const niche = String(input.niche || '').trim() || 'your service';
  return [
    `You do not need more generic ${niche.toLowerCase()} marketing. You need one clear reason to respond now.`,
    'The form asks for enough context to qualify the lead before the conversation starts.',
    'Everything on the page serves the opt-in instead of distracting from it.',
  ];
}

function shouldUseSocialProof(input) {
  const notes = [
    input.sourcePrompt,
    input.strategyNotes,
    input.landingPageType,
  ].join(' ').toLowerCase();

  return (
    notes.includes('complex') ||
    notes.includes('case study') ||
    notes.includes('proof') ||
    notes.includes('trust') ||
    notes.includes('high ticket') ||
    notes.includes('high-ticket')
  );
}

function buildQualificationFields(input) {
  if (input.landingPageType === 'lead_magnet') {
    return [
      { name: 'name', label: 'Full name', type: 'text', placeholder: 'Your name', required: true },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
      { name: 'business', label: 'Business or role', type: 'text', placeholder: 'What do you do?', required: true },
    ];
  }

  return [
    { name: 'name', label: 'Full name', type: 'text', placeholder: 'Your name', required: true },
    { name: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com', required: true },
    { name: 'phone', label: 'Phone', type: 'tel', placeholder: '(555) 555-5555', required: true },
    { name: 'business', label: 'Business', type: 'text', placeholder: 'Business name', required: input.landingPageType !== 'booking' },
    {
      name: 'message',
      label: input.landingPageType === 'booking' ? 'What result are you after?' : 'Biggest goal',
      type: 'textarea',
      placeholder: input.landingPageType === 'booking'
        ? 'Tell us the outcome you want and what is getting in the way.'
        : 'Tell us what result you want and why now is the right time.',
      required: true,
    },
  ].filter((field) => field.name !== 'business' || input.landingPageType !== 'booking');
}

function buildFallbackBlueprint(input) {
  const theme = inferTheme(input);
  const objections = splitLines(input.objectionBullets || '', 3);
  const testimonials = splitLines(input.testimonials || '', 3);
  const outcome = String(input.primaryOutcome || `${input.niche || input.clientName || 'your business'} inquiries`).trim();
  const cta = String(input.cta || 'Book the next step').trim();

  return {
    theme,
    heroLayout: theme === 'editorial' ? 'poster' : 'split',
    visualThesis: input.visualTheme || `${theme} direction with one dominant proof image and minimal chrome.`,
    interactionThesis: [
      'Fade and lift the hero copy on load.',
      'Use restrained reveal motion only when it sharpens hierarchy.',
      'Keep the form area calm and direct.',
    ],
    eyebrow: input.niche ? `${input.niche} landing page` : 'Qualified lead landing page',
    headline: input.headline || `Turn attention into ${outcome}.`,
    subheadline:
      input.subheadline ||
      'The headline makes the promise. The page adds only the context, proof, and qualification needed to turn the right click into the right lead.',
    heroProofLabel: input.heroProofLabel || 'What they are getting',
    heroProofDetail:
      input.heroProofDetail ||
      `A direct path to ${outcome} without padding the page with sections that do not help the opt-in.`,
    leadMagnetLine: String(input.leadMagnetLine || '').trim(),
    objectionItems: objections.length ? objections : defaultObjectionItems(input),
    socialProofItems: testimonials.length ? testimonials : [
      'We stopped attracting browsers and started attracting buyers. - Founder',
      'The page finally matched the promise in the content. - Service owner',
    ],
    showSocialProof: shouldUseSocialProof(input),
    finalCtaHeadline: cta,
    finalCtaBody:
      input.landingPageType === 'lead_magnet'
        ? 'Leave the details that help qualify the fit, then get the resource right away.'
        : 'Answer the few questions that matter so the next step starts with context instead of guesswork.',
    formIntro:
      input.landingPageType === 'lead_magnet'
        ? 'Short form, clear value, and just enough detail to filter for fit.'
        : 'Ask for enough information to qualify the lead without turning the form into a wall.',
    legalLine:
      'By submitting this form, you agree to be contacted about this offer and accept the privacy and consent terms linked below.',
  };
}

function applyInputGuardrails(input, blueprint) {
  const guarded = { ...blueprint };

  if (input.headline) guarded.headline = input.headline;
  if (input.subheadline) guarded.subheadline = input.subheadline;
  if (input.cta) guarded.finalCtaHeadline = input.cta;
  if (input.leadMagnetLine) guarded.leadMagnetLine = input.leadMagnetLine;
  if (input.objectionBullets) guarded.objectionItems = splitLines(input.objectionBullets, 3);
  if (input.testimonials) guarded.socialProofItems = splitLines(input.testimonials, 3);
  if (input.visualTheme) guarded.visualThesis = input.visualTheme;
  if (input.primaryOutcome && !input.headline) {
    guarded.headline = `Turn attention into ${input.primaryOutcome}.`;
  }

  return guarded;
}

async function generateBlueprint(input, fallbackBlueprint) {
  const sourcePrompt = String(input.sourcePrompt || '').trim();
  const strategyNotes = String(input.strategyNotes || '').trim();
  if (!sourcePrompt && !strategyNotes) return fallbackBlueprint;

  const prompt = `You are a direct-response landing page strategist and premium art director.

Create a landing-page blueprint as JSON only.

Context:
- Client: ${input.clientName || 'Unknown client'}
- Niche: ${input.niche || 'General service business'}
- Offer: ${input.offerName || input.offerId || 'Offer not specified'}
- CTA: ${input.cta || 'Book the next step'}
- Page type: ${input.landingPageType || 'booking'}
- Visual direction hint: ${input.visualTheme || 'open'}
- User prompt: ${sourcePrompt || 'none'}
- Strategy notes: ${strategyNotes || 'none'}

Return JSON with this exact shape:
{
  "theme": "cinematic|editorial|studio|minimal",
  "heroLayout": "poster|split",
  "visualThesis": "one sentence",
  "interactionThesis": ["idea 1","idea 2","idea 3"],
  "eyebrow": "short phrase",
  "headline": "headline",
  "subheadline": "subheadline",
  "heroProofLabel": "short proof label",
  "heroProofDetail": "one sentence",
  "leadMagnetLine": "optional one-line justification or empty string",
  "objectionItems": ["objection reversal 1","objection reversal 2","objection reversal 3"],
  "socialProofItems": ["quote - author","quote - author"],
  "showSocialProof": true,
  "finalCtaHeadline": "cta block headline",
  "finalCtaBody": "cta block body",
  "formIntro": "one sentence",
  "legalLine": "one sentence"
}

Rules:
- Headline must stop the visitor and promise a clear outcome.
- Subheadline must add context to the promise, not repeat it.
- The hero image should visually prove the result or show the outcome they want.
- CTA must say what they get and how they get it. Keep it concrete.
- Keep the layout sparse. If a section does not help qualified opt-in rate, cut it.
- Use exactly three objection-handling bullets ordered from most common to least common.
- Social proof is optional. Only include it when it genuinely helps a more complex offer.
- Keep copy concise, specific, mobile-first, and conversion-aware.
- Any implied imagery, proof, or examples must match the actual niche. Never default to weddings or photographers unless the niche is explicitly wedding-related.
- No markdown, no commentary, JSON only.`;

  try {
    const response = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.model || 'qwen2.5:14b',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.8, num_ctx: 8192, num_predict: 1200 },
      }),
    });
    if (!response.ok) return fallbackBlueprint;
    const data = await response.json();
    const content = String(data.message?.content || '{}')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = safeJsonParse(content, null);
    if (!parsed || typeof parsed !== 'object') return fallbackBlueprint;
    const merged = {
      ...fallbackBlueprint,
      theme: THEME_PRESETS[parsed.theme] ? parsed.theme : fallbackBlueprint.theme,
      heroLayout: ['poster', 'split'].includes(parsed.heroLayout) ? parsed.heroLayout : fallbackBlueprint.heroLayout,
      interactionThesis: clampItems(parsed.interactionThesis || fallbackBlueprint.interactionThesis, 4),
      showSocialProof: typeof parsed.showSocialProof === 'boolean' ? parsed.showSocialProof : fallbackBlueprint.showSocialProof,
      visualThesis: input.visualTheme || parsed.visualThesis || fallbackBlueprint.visualThesis,
      eyebrow: fallbackBlueprint.eyebrow,
      headline: input.headline ? fallbackBlueprint.headline : (parsed.headline || fallbackBlueprint.headline),
      subheadline: input.subheadline ? fallbackBlueprint.subheadline : (parsed.subheadline || fallbackBlueprint.subheadline),
      heroProofLabel: fallbackBlueprint.heroProofLabel,
      heroProofDetail: fallbackBlueprint.heroProofDetail,
      leadMagnetLine: input.leadMagnetLine ? fallbackBlueprint.leadMagnetLine : (parsed.leadMagnetLine || fallbackBlueprint.leadMagnetLine),
      objectionItems: input.objectionBullets ? fallbackBlueprint.objectionItems : clampItems(parsed.objectionItems || fallbackBlueprint.objectionItems, 3),
      socialProofItems: input.testimonials ? fallbackBlueprint.socialProofItems : clampItems(parsed.socialProofItems || fallbackBlueprint.socialProofItems, 3),
      finalCtaHeadline: input.cta ? fallbackBlueprint.finalCtaHeadline : (parsed.finalCtaHeadline || fallbackBlueprint.finalCtaHeadline),
      finalCtaBody: fallbackBlueprint.finalCtaBody,
      formIntro: fallbackBlueprint.formIntro,
      legalLine: fallbackBlueprint.legalLine,
    };
    return applyInputGuardrails(input, merged);
  } catch {
    return fallbackBlueprint;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLandingPage({ input, landingPage, hiddenFields, blueprint }) {
  const themeKey = THEME_PRESETS[blueprint.theme] ? blueprint.theme : 'studio';
  const theme = THEME_PRESETS[themeKey] || THEME_PRESETS.studio;
  const imagery = resolveThemeImages(input, themeKey);
  const accent = input.color || theme.accent;
  const pageTitle = `${input.clientName || 'OTG'} - ${blueprint.headline}`;
  const formFields = buildQualificationFields(input);
  const primaryCta = blueprint.finalCtaHeadline || input.cta || 'Book the next step';
  const showSocialProof = blueprint.showSocialProof && blueprint.socialProofItems.length > 0;
  const formSubtitle = String(blueprint.leadMagnetLine || blueprint.formIntro || '').trim();
  const proofImageAlt = `${input.clientName || input.niche || 'Offer'} proof image`;
  const fieldMarkup = formFields.map((field) => {
    if (field.type === 'textarea') {
      return `<div class="field">
        <label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
        <textarea id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" placeholder="${escapeHtml(field.placeholder)}" ${field.required ? 'required' : ''}></textarea>
      </div>`;
    }

    return `<div class="field">
      <label for="${escapeHtml(field.name)}">${escapeHtml(field.label)}</label>
      <input id="${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" type="${escapeHtml(field.type)}" placeholder="${escapeHtml(field.placeholder)}" ${field.required ? 'required' : ''} />
    </div>`;
  }).join('');
  const hiddenFieldMarkup = Object.entries(hiddenFields)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value || '')}" />`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${theme.fonts}&display=swap" rel="stylesheet">
<style>
  :root {
    --accent: ${accent};
    --bg: ${theme.bg};
    --bg-alt: ${theme.bgAlt};
    --surface: ${theme.surface};
    --text: ${theme.text};
    --muted: ${theme.muted};
    --line: ${theme.line};
    --display: ${theme.displayFont};
    --body: ${theme.bodyFont};
    --shadow: 0 30px 80px rgba(0,0,0,0.18);
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--body);
  }
  a { color: inherit; text-decoration: none; }
  .page-shell { min-height: 100vh; }
  .hero {
    min-height: 100svh;
    display: grid;
    grid-template-columns: ${blueprint.heroLayout === 'poster' ? '1fr' : 'minmax(0, 0.96fr) minmax(0, 1.04fr)'};
    align-items: stretch;
    position: relative;
    overflow: clip;
  }
  .hero-copy {
    padding: clamp(2rem, 6vw, 5rem) clamp(1.25rem, 4vw, 4rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: ${blueprint.heroLayout === 'poster' ? '48rem' : '34rem'};
    z-index: 2;
  }
  .eyebrow {
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 800;
    font-size: 0.78rem;
    margin-bottom: 1rem;
  }
  .hero h1 {
    font-family: var(--display);
    font-size: clamp(2.9rem, 8vw, 6rem);
    line-height: 0.95;
    letter-spacing: -0.05em;
    max-width: 10ch;
    margin: 0;
  }
  .hero-copy p {
    margin-top: 1.1rem;
    color: var(--muted);
    line-height: 1.62;
    font-size: clamp(1rem, 1.6vw, 1.18rem);
    max-width: 34rem;
  }
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    margin-top: 1.8rem;
  }
  .hero-actions a {
    padding: 1rem 1.3rem;
    border-radius: 999px;
    font-weight: 800;
    border: 1px solid transparent;
    background: var(--accent);
    color: #111;
    box-shadow: 0 18px 48px ${accent}33;
  }
  .hero-proof {
    margin-top: 1.5rem;
    display: grid;
    gap: 0.35rem;
    padding-left: 1rem;
    border-left: 2px solid var(--accent);
    max-width: 26rem;
  }
  .hero-proof strong {
    display: block;
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--accent);
  }
  .hero-proof span {
    color: var(--text);
    font-size: 1rem;
    line-height: 1.5;
  }
  .hero-visual {
    position: relative;
    min-height: 30rem;
    background:
      linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.42)),
      url('${imagery.heroImage}') center/cover no-repeat;
  }
  .hero.poster .hero-visual {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .hero.poster .hero-copy {
    position: relative;
    min-height: 100svh;
  }
  .hero.poster .hero-copy::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(0,0,0,0.74), rgba(0,0,0,0.24));
    z-index: -1;
  }
  .visual-card {
    position: absolute;
    right: clamp(1rem, 3vw, 2rem);
    bottom: clamp(1rem, 3vw, 2rem);
    width: min(24rem, calc(100% - 2rem));
    padding: 1rem 1.05rem;
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    border: 1px solid var(--line);
    border-radius: 1.25rem;
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
  }
  .visual-card small {
    display: block;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 0.45rem;
  }
  .visual-card strong {
    display: block;
    font-size: 1rem;
    margin-bottom: 0.45rem;
  }
  .visual-card p {
    color: var(--muted);
    line-height: 1.55;
    margin: 0;
  }
  section { padding: clamp(2.6rem, 6vw, 5rem) clamp(1.25rem, 4vw, 4rem); }
  .section-inner { max-width: 72rem; margin: 0 auto; }
  .objections {
    background: var(--bg-alt);
    border-top: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }
  .objection-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
  .objection-grid article,
  .proof-strip article,
  .cta-panel,
  .form-panel {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 1.25rem;
    padding: 1.2rem;
  }
  .objection-grid h2,
  .proof-strip h2,
  .cta-panel h2,
  .form-panel h2 {
    margin: 0 0 0.45rem;
    font-size: 1.08rem;
  }
  .objection-grid p,
  .proof-strip p,
  .cta-panel p,
  .form-panel p {
    color: var(--muted);
    line-height: 1.65;
    margin: 0;
  }
  .proof-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 1rem;
  }
  .form-band {
    display: grid;
    grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
    gap: 1.1rem;
  }
  .form-panel {
    padding: 1.35rem 1.35rem 1.1rem;
  }
  .field { display: grid; gap: 0.42rem; margin-bottom: 0.9rem; }
  .field label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-weight: 700;
    color: var(--muted);
  }
  .field input,
  .field textarea {
    width: 100%;
    padding: 0.95rem 1rem;
    border-radius: 0.95rem;
    border: 1px solid var(--line);
    background: rgba(255,255,255,0.01);
    color: var(--text);
    font: inherit;
  }
  .field textarea {
    min-height: 7rem;
    resize: vertical;
  }
  .submit {
    width: 100%;
    border: 0;
    border-radius: 999px;
    padding: 1rem 1.2rem;
    font: inherit;
    font-weight: 800;
    background: var(--accent);
    color: #111;
    cursor: pointer;
  }
  .microcopy {
    margin-top: 0.8rem;
    color: var(--muted);
    font-size: 0.88rem;
    line-height: 1.55;
  }
  .legal {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.82rem;
  }
  footer {
    padding: 1.5rem 1.4rem 2.2rem;
    color: var(--muted);
    font-size: 0.82rem;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  @media (max-width: 980px) {
    .hero,
    .form-band,
    .objection-grid {
      grid-template-columns: 1fr;
    }
    .hero { min-height: auto; }
    .hero-copy,
    .hero.poster .hero-copy { min-height: auto; }
    .hero-visual { min-height: 22rem; order: -1; }
    .hero.poster .hero-visual { position: relative; inset: auto; min-height: 24rem; }
    .hero.poster .hero-copy::before { display: none; }
  }
  @media (max-width: 680px) {
    .hero-copy { padding: 1.5rem 1.1rem 2rem; }
    section { padding: 2.2rem 1.1rem; }
    .visual-card { position: static; width: auto; margin: 1rem; }
  }
</style>
</head>
<body>
  <div class="page-shell">
    <section class="hero ${escapeHtml(blueprint.heroLayout)}">
      <div class="hero-copy">
        <div class="eyebrow">${escapeHtml(blueprint.eyebrow)}</div>
        <h1>${escapeHtml(blueprint.headline)}</h1>
        <p>${escapeHtml(blueprint.subheadline)}</p>
        <div class="hero-actions">
          <a href="#apply">${escapeHtml(primaryCta)}</a>
        </div>
        <div class="hero-proof">
          <strong>${escapeHtml(blueprint.heroProofLabel)}</strong>
          <span>${escapeHtml(blueprint.heroProofDetail)}</span>
        </div>
      </div>
      <div class="hero-visual" role="img" aria-label="${escapeHtml(proofImageAlt)}">
        <div class="visual-card">
          <small>${escapeHtml(input.clientName || input.niche || 'Offer')}</small>
          <strong>${escapeHtml(blueprint.visualThesis)}</strong>
          <p>${escapeHtml(blueprint.interactionThesis.join(' '))}</p>
        </div>
      </div>
    </section>

    <section class="objections">
      <div class="section-inner">
        <div class="objection-grid">
          ${blueprint.objectionItems.map((item, index) => `
            <article>
              <h2>0${index + 1}</h2>
              <p>${escapeHtml(item)}</p>
            </article>
          `).join('')}
        </div>
      </div>
    </section>

    ${showSocialProof ? `
      <section>
        <div class="section-inner">
          <div class="proof-strip">
            ${blueprint.socialProofItems.map((item) => `
              <article>
                <h2>Proof</h2>
                <p>${escapeHtml(item)}</p>
              </article>
            `).join('')}
          </div>
        </div>
      </section>
    ` : ''}

    <section id="apply">
      <div class="section-inner form-band">
        <div class="cta-panel">
          <div class="eyebrow">Qualified next step</div>
          <h2 style="margin-top:0;">${escapeHtml(primaryCta)}</h2>
          <p>${escapeHtml(blueprint.finalCtaBody)}</p>
          ${formSubtitle ? `<p style="margin-top:1rem;">${escapeHtml(formSubtitle)}</p>` : ''}
        </div>
        <div class="form-panel">
          <form id="leadForm">
            <h2 style="margin-top:0;">Tell us enough to qualify the next step</h2>
            <p>${escapeHtml('Keep the form short enough for mobile, but specific enough to filter for fit.')}</p>
            ${fieldMarkup}
            ${hiddenFieldMarkup}
            <button class="submit" type="submit">${escapeHtml(primaryCta)}</button>
            <div class="microcopy">${escapeHtml('This form keeps the lead context, attribution, and CTA source attached to the record.')}</div>
            <div class="legal">
              <span>${escapeHtml(blueprint.legalLine)}</span>
              <span>Privacy Policy</span>
              <span>Terms</span>
            </div>
          </form>
        </div>
      </div>
    </section>

    <footer>
      <span>${escapeHtml(`${input.clientName || 'OTG'} - ${input.landingPageType || 'booking'} page - ${landingPage.id}`)}</span>
      <span>${escapeHtml(`CTA ${input.ctaKeyword || 'GUIDE'} - Page ${landingPage.slug}`)}</span>
    </footer>
  </div>
  <script>
    const form = document.getElementById('leadForm');
    if (form) {
      form.addEventListener('submit', async function(event) {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        try {
          await fetch('/api/funnel-records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create-lead',
              lead: {
                client_id: data.client_id,
                campaign_id: data.campaign_id,
                content_asset_id: data.content_asset_id,
                published_post_id: data.published_post_id,
                landing_page_id: data.landing_page_id,
                cta_id: data.cta_id,
                cta_keyword: data.cta_keyword,
                platform: data.platform,
                name: data.name,
                email: data.email,
                phone: data.phone,
                business: data.business,
                message: data.message,
                source: 'landing_page_form',
              }
            })
          });
          alert('Thanks - your request has been captured.');
          form.reset();
        } catch (error) {
          alert('Your form was captured locally, but the lead sync hit an issue.');
        }
      });
    }
  </script>
</body>
</html>`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const derivedContext = buildPageContext(body.assetId || body.asset_id || '');
    const input = {
      clientName: body.clientName || body.client_name || 'OTG',
      niche: body.niche || derivedContext?.niche || 'Short-form content',
      headline: body.headline || derivedContext?.headline || '',
      subheadline: body.subheadline || derivedContext?.subheadline || '',
      benefits: body.benefits || (derivedContext?.benefits || []).join('\n'),
      process: body.process || (derivedContext?.process || []).join('\n'),
      cta: body.cta || 'Book Your Strategy Call',
      ctaKeyword: body.ctaKeyword || body.cta_keyword || 'GUIDE',
      ctaId: body.ctaId || body.cta_id || derivedContext?.ctaId || 'cta_default',
      landingPageType: body.landingPageType || body.type || 'booking',
      color: body.color || '',
      darkMode: body.darkMode !== false,
      strategyNotes: String(body.strategyNotes || derivedContext?.strategyNotes || ''),
      sourcePrompt: String(body.sourcePrompt || body.prompt || derivedContext?.sourcePrompt || ''),
      visualTheme: String(body.visualTheme || ''),
      leadMagnetLine: String(body.leadMagnetLine || ''),
      objectionBullets: String(body.objectionBullets || ''),
      testimonials: String(body.testimonials || ''),
      primaryOutcome: String(body.primaryOutcome || ''),
      model: body.model || 'qwen2.5:14b',
      clientId: body.clientId || body.client_id || derivedContext?.clientId || 'cli_default',
      offerId: body.offerId || body.offer_id || 'off_default',
      offerName: body.offerName || body.offer_name || derivedContext?.offerName || '',
      campaignId: body.campaignId || body.campaign_id || derivedContext?.campaignId || 'cmp_default',
      contentAssetId: body.contentAssetId || body.content_asset_id || derivedContext?.assetId || '',
      publishedPostId: body.publishedPostId || body.published_post_id || '',
      platform: body.platform || derivedContext?.platforms?.[0] || 'instagram',
      utm_source: body.utm_source || 'organic_social',
      utm_medium: body.utm_medium || 'short_form',
      slug: body.slug || '',
    };

    const pageSlug = toSlug(input.slug || `${input.clientName}-${input.niche}-${input.landingPageType}`);
    const fallbackBlueprint = buildFallbackBlueprint(input);
    const blueprint = await generateBlueprint(input, fallbackBlueprint);

    const landingPage = addLandingPage({
      client_id: input.clientId,
      offer_id: input.offerId,
      campaign_id: input.campaignId,
      type: input.landingPageType,
      name: `${input.clientName} ${input.landingPageType.replace(/_/g, ' ')}`.trim(),
      slug: pageSlug,
      page_url: `http://localhost:4000/landing/${pageSlug}`,
      cta_id: input.ctaId,
      cta_keyword: input.ctaKeyword,
      status: 'active',
      headline: blueprint.headline,
      subheadline: blueprint.subheadline,
      primary_outcome: input.primaryOutcome || 'booked sales calls',
      created_by: 'dev',
      source_system: 'landing_page_service',
    });

    const hiddenFields = {
      client_id: input.clientId,
      campaign_id: input.campaignId,
      content_asset_id: input.contentAssetId,
      published_post_id: input.publishedPostId,
      platform: input.platform,
      cta_id: input.ctaId,
      cta_keyword: input.ctaKeyword,
      landing_page_id: landingPage.id,
      utm_source: input.utm_source,
      utm_medium: input.utm_medium,
      utm_campaign: body.utm_campaign || pageSlug,
    };

    const html = renderLandingPage({ input, landingPage, hiddenFields, blueprint });
    const filename = `${pageSlug}.html`;

    saveToWorkspace('dev', `landing-pages/${filename}`, html);

    return Response.json({
      success: true,
      filename,
      html,
      pageId: landingPage.id,
      pageUrl: landingPage.page_url,
      blueprint,
      pageContext: derivedContext,
      ghlPageBrief: buildGhlPageBrief(derivedContext),
      theme: blueprint.theme,
      heroLayout: blueprint.heroLayout,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
