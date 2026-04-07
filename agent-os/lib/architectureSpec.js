export const ARCHITECTURE_SPEC = {
  version: '1.0',
  name: 'Content Intelligence System',
  purpose: [
    'Turn client strategy, raw footage, AI-native creative, platform performance, funnel activity, and CRM outcomes into published short-form content, attributable leads, booked sales calls, measurable revenue influence, and continuously improving recommendations.',
  ],
  primaryBusinessObjective: [
    'What content should we make next?',
    'Can we turn raw footage into content efficiently?',
    'Can we generate AI-native content when footage is weak or absent?',
    'Which posts create leads?',
    'Which leads become booked calls?',
    'Which calls become sales?',
    'What patterns should we double down on?',
  ],
  nonGoals: [
    'Do not automate every social platform in v1.',
    'Do not support every niche equally well in v1.',
    'Do not fully remove human review for sensitive claims.',
    'Do not build deep enterprise BI across all paid media in v1.',
    'Do not replace human sales follow-up.',
  ],
  v1Focus: [
    'Instagram Reels',
    'YouTube Shorts',
    'GHL funnel, calendar, and pipeline attribution',
    'Resolve-first footage editing',
    'Remotion-first template content',
  ],
  designPrinciples: [
    'Postgres is the canonical source of truth for system state.',
    'Object storage is the canonical source of truth for media binaries.',
    'GHL is the operational CRM and funnel layer, not the content system of record.',
    'Every asset gets an ID.',
    'Every state change emits an event.',
    'Every outbound post must map to a CTA and attribution path.',
    'Every recommendation must be explainable by performance and source data.',
    'Human approval gates exist for high-risk outputs.',
    'Idempotency is required for publish, webhook, and CRM writes.',
    'Views are secondary; booked calls and revenue are primary.',
  ],
  externalSystems: [
    'DaVinci Resolve Studio with Python scripting',
    'Remotion rendering service',
    'GoHighLevel',
    'Instagram Platform and Graph API',
    'YouTube Data API',
    'Email and notification provider',
    'Cloud object storage',
    'Analytics warehouse and BI layer',
  ],
  internalServices: [
    'Control Plane / Orchestrator',
    'Client Intelligence Service',
    'Content Intelligence Service',
    'Media Intelligence Service',
    'Editing Orchestrator',
    'Resolve Worker',
    'Remotion Renderer',
    'Publishing Gateway',
    'Attribution Service',
    'Reporting Service',
    'Policy / QA Service',
  ],
  productionLanes: {
    resolve: {
      useWhen: [
        'There is strong raw footage.',
        'There are real speakers or testimonials.',
        'Clipping and transcript extraction matter.',
        'Human-feeling edits matter.',
      ],
      inputs: ['media IDs', 'clip selections', 'edit brief', 'subtitle style', 'render presets'],
      outputs: ['vertical post renders', 'multiple cutdowns', 'subtitle versions', 'textless masters', 'thumbnail frames'],
    },
    remotion: {
      useWhen: [
        'Content is template-led.',
        'AI-native content is needed.',
        'Batch rendering is needed.',
        'Highly structured overlays are needed.',
        'Scale matters more than handcrafted timeline work.',
      ],
      inputs: ['JSON props', 'script text', 'branding config', 'CTA config', 'proof snippets'],
      outputs: ['MP4 render', 'alt aspect ratios', 'thumbnails', 'version variants'],
    },
    hybrid: {
      useWhen: [
        'There is source footage plus overlays, proof graphics, CTA cards, or branded wrappers.',
      ],
      inputs: ['footage selections', 'overlay config', 'brand wrappers', 'proof snippets'],
      outputs: ['footage-plus-template renders', 'hybrid variants'],
    },
  },
  publishSafetyRules: [
    'No publish without approved CTA.',
    'No publish without landing-page mapping.',
    'No duplicate publish on retry.',
    'Store platform_post_id and permalink immediately.',
    'Retries must be idempotent.',
  ],
  attributionFields: [
    'client_id',
    'campaign_id',
    'content_asset_id',
    'published_post_id',
    'platform',
    'cta_id',
    'cta_keyword',
    'landing_page_id',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'first_touch_timestamp',
    'last_touch_timestamp',
  ],
  decisionRules: [
    'Resolve-first when the asset starts with real footage.',
    'Remotion-first when the asset starts with structured data, templates, or AI-native creative.',
    'GHL-first when the asset needs lead routing, appointment booking, or opportunity tracking.',
    'Postgres-first for canonical IDs, state, orchestration, attribution, and reporting.',
    'Human approval first for claims, strategy shifts, and risky outbound content.',
  ],
  failureHandling: [
    'If publish fails, asset returns to published_ready.',
    'If GHL write fails, retry with idempotency key.',
    'If webhook payload is invalid, dead-letter and alert.',
    'If Resolve worker fails, reroute or mark lane unavailable.',
    'If Remotion render fails, preserve input props and error trace.',
    'If platform API rejects media, mark platform_validation_failed.',
  ],
  slaTargets: [
    'Media ingest to transcript under 15 minutes.',
    'Transcript to clip candidates under 10 minutes.',
    'Script generation under 2 minutes.',
    'Render queue start under 5 minutes.',
    'Publish after approval under 15 minutes.',
    'GHL sync after form submit under 1 minute.',
    'Dashboard refresh lag under 15 minutes.',
  ],
  buildOrder: [
    'Phase 1 - Spine: Postgres schema, object storage, event model, client memory model, GHL connector, attribution fields, opportunity sync.',
    'Phase 2 - Footage lane: upload flow, transcript flow, clip candidates, Resolve job model, render outputs, publish mapping.',
    'Phase 3 - AI lane: Remotion templates, script-to-render props, batch render jobs, CTA overlays, proof-driven templates.',
    'Phase 4 - Intelligence: topic scoring, hook scoring, ROI scoring, winner detection, repurpose engine, recommendations dashboard.',
  ],
  definitionOfDoneV1: [
    'Ingest raw footage.',
    'Generate transcript and clip candidates.',
    'Create Resolve edit jobs.',
    'Create Remotion render jobs.',
    'Publish approved content.',
    'Route traffic to a mapped landing page.',
    'Write leads into GHL with attribution.',
    'Write bookings into opportunities and appointments.',
    'Report which posts produced which calls.',
    'Report which calls produced which revenue.',
  ],
  openIssues: [
    'Single-tenant vs multi-tenant workspace model.',
    'Whether to use GHL custom objects for content metadata or keep metadata in Postgres only.',
    'Whether publishing should be direct API-first or partially human-assisted in v1.',
    'Whether transcription runs in-house or through a managed API.',
    'Whether reporting lives in-app only or also in a BI tool.',
    'Whether Resolve workers are centralized or client-dedicated.',
    'Exact lead-quality scoring formula.',
    'Exact winner threshold formula.',
  ],
  nextArtifacts: [
    'ERD for the Postgres schema.',
    'API contract spec for each service.',
    'State-transition table.',
    'Webhook payload map for GHL sync.',
    'Remotion composition registry.',
    'Resolve job manifest schema.',
    'Client dashboard spec.',
    'v1 sprint plan.',
  ],
  serviceResponsibilities: {
    controlPlane: [
      'Own workflow sequencing, job dispatch, retries, dependency checks, approval queues, and state transitions.',
    ],
    clientIntelligence: [
      'Store canonical client profile, offer catalog, personas, brand voice, objections, proof, claims, CTA library, funnel map, and historical performance summary.',
    ],
    contentIntelligence: [
      'Ingest research and performance, score topics and hooks, rank formats and CTAs, detect winners and losers, and generate repurpose opportunities.',
    ],
    mediaIntelligence: [
      'Ingest raw footage, transcribe audio, detect scenes and speakers, classify moments, tag proof and objection clips, and score clip candidates.',
    ],
    editingOrchestrator: [
      'Choose Resolve, Remotion, or hybrid editing paths and track render state.',
    ],
    resolveWorker: [
      'Automate footage-rich edits, timelines, subtitles, titles, and render variants inside Resolve.',
    ],
    remotionRenderer: [
      'Render AI-native, caption-led, and template-based assets from structured JSON.',
    ],
    publishingGateway: [
      'Normalize platform packaging, store platform IDs, retry safely, and emit publish events.',
    ],
    attributionService: [
      'Map posts to GHL funnel activity, contacts, appointments, and opportunities while syncing attribution back into Postgres.',
    ],
    reportingService: [
      'Compute content, funnel, and sales KPIs and generate weekly optimization recommendations.',
    ],
    policyQa: [
      'Validate claims, CTA linkage, banned topics, landing-page linkage, and approval gates before publish.',
    ],
  },
};

function formatList(title, items = []) {
  return `${title}: ${items.join(' | ')}`;
}

export function buildArchitectureTargetContext(agentId = '') {
  const lines = [
    `[ARCHITECTURE TARGET ${ARCHITECTURE_SPEC.version}]`,
    `SYSTEM: ${ARCHITECTURE_SPEC.name}`,
    formatList('PURPOSE', ARCHITECTURE_SPEC.purpose),
    formatList('PRIMARY BUSINESS QUESTIONS', ARCHITECTURE_SPEC.primaryBusinessObjective),
    formatList('V1 FOCUS', ARCHITECTURE_SPEC.v1Focus),
    formatList('DESIGN PRINCIPLES', ARCHITECTURE_SPEC.designPrinciples),
    formatList('INTERNAL SERVICES', ARCHITECTURE_SPEC.internalServices),
    formatList('DECISION RULES', ARCHITECTURE_SPEC.decisionRules),
  ];

  if (agentId === 'cto' || agentId === 'dev') {
    lines.push(formatList('NON-GOALS', ARCHITECTURE_SPEC.nonGoals));
    lines.push(formatList('EXTERNAL SYSTEMS', ARCHITECTURE_SPEC.externalSystems));
    lines.push(formatList('CONTROL PLANE', ARCHITECTURE_SPEC.serviceResponsibilities.controlPlane));
    lines.push(formatList('CLIENT INTELLIGENCE', ARCHITECTURE_SPEC.serviceResponsibilities.clientIntelligence));
    lines.push(formatList('CONTENT INTELLIGENCE', ARCHITECTURE_SPEC.serviceResponsibilities.contentIntelligence));
    lines.push(formatList('MEDIA INTELLIGENCE', ARCHITECTURE_SPEC.serviceResponsibilities.mediaIntelligence));
    lines.push(formatList('EDITING ORCHESTRATOR', ARCHITECTURE_SPEC.serviceResponsibilities.editingOrchestrator));
    lines.push(formatList('ATTRIBUTION', ARCHITECTURE_SPEC.serviceResponsibilities.attributionService));
    lines.push(formatList('POLICY AND QA', ARCHITECTURE_SPEC.serviceResponsibilities.policyQa));
    lines.push(formatList('PUBLISH SAFETY', ARCHITECTURE_SPEC.publishSafetyRules));
    lines.push(formatList('FAILURE HANDLING', ARCHITECTURE_SPEC.failureHandling));
    lines.push(formatList('SLA TARGETS', ARCHITECTURE_SPEC.slaTargets));
    lines.push(formatList('OPEN ISSUES', ARCHITECTURE_SPEC.openIssues));
  }

  if (agentId === 'jordan' || agentId === 'sam' || agentId === 'maya') {
    lines.push('CONTENT SUCCESS MUST BE EXPLAINABLE BY PERFORMANCE, LEADS, BOOKED CALLS, AND REVENUE INFLUENCE - not views alone.');
    lines.push('EVERY POST SHOULD MAP TO A CTA PATH, ATTRIBUTION PATH, AND OFFER CONTINUITY.');
    lines.push(formatList('ATTRIBUTION FIELDS', ARCHITECTURE_SPEC.attributionFields));
  }

  lines.push('[END ARCHITECTURE TARGET]');
  return lines.join('\n');
}
