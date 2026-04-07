export const CANONICAL_ENTITIES = {
  client_strategy: [
    'client',
    'brand_profile',
    'offer',
    'persona',
    'campaign',
    'content_pillar',
    'objection',
    'proof_asset',
    'claim_rule',
  ],
  source_content: [
    'source_media',
    'transcript',
    'speaker_segment',
    'scene_segment',
    'clip_candidate',
  ],
  content_planning: [
    'topic_brief',
    'hook_variant',
    'script',
    'cta',
    'post_package',
  ],
  production: [
    'shoot_schedule',
    'edit_job',
    'render_job',
    'content_asset',
    'thumbnail_asset',
    'caption_asset',
  ],
  distribution: [
    'published_post',
    'platform_metric_snapshot',
  ],
  funnel_crm: [
    'landing_page',
    'lead',
    'contact_link',
    'opportunity',
    'appointment',
    'sale',
  ],
  analytics: [
    'event_log',
    'attribution_touch',
    'performance_rollup',
    'recommendation',
  ],
};

export const ENTITY_ID_PREFIXES = {
  client: 'cli_',
  brand_profile: 'brd_',
  offer: 'off_',
  persona: 'per_',
  campaign: 'cmp_',
  content_pillar: 'pil_',
  objection: 'obj_',
  proof_asset: 'prf_',
  claim_rule: 'clr_',
  source_media: 'med_',
  transcript: 'trn_',
  speaker_segment: 'spk_',
  scene_segment: 'scn_',
  clip_candidate: 'clip_',
  topic_brief: 'tpc_',
  hook_variant: 'hok_',
  script: 'scr_',
  cta: 'cta_',
  post_package: 'pkg_',
  shoot_schedule: 'sht_',
  edit_job: 'edt_',
  render_job: 'rnd_',
  content_asset: 'ast_',
  thumbnail_asset: 'thm_',
  caption_asset: 'cap_',
  published_post: 'pst_',
  platform_metric_snapshot: 'pms_',
  landing_page: 'lpg_',
  lead: 'led_',
  contact_link: 'clk_',
  opportunity: 'opp_',
  appointment: 'apt_',
  sale: 'sal_',
  event_log: 'evt_',
  attribution_touch: 'att_',
  performance_rollup: 'prl_',
  recommendation: 'rec_',
};

export const REQUIRED_SYSTEM_FIELDS = [
  'version',
  'created_at',
  'updated_at',
  'created_by',
  'source_system',
];

export const CANONICAL_SCHEMAS = {
  client: {
    id: 'cli_xxx',
    name: 'Client Name',
    status: 'active',
    timezone: 'America/Los_Angeles',
    primary_channels: ['instagram', 'youtube'],
    ghl_location_id: 'string',
    default_calendar_id: 'string',
  },
  offer: {
    id: 'off_xxx',
    client_id: 'cli_xxx',
    name: 'Short Form Content System',
    category: 'service',
    price_floor: 1500,
    primary_outcome: 'booked sales calls',
    qualified_lead_definition: {
      persona_match: true,
      budget_min: 1000,
      urgency_window_days: 30,
    },
  },
  source_media: {
    id: 'med_xxx',
    client_id: 'cli_xxx',
    type: 'video',
    storage_uri: 's3://bucket/key.mp4',
    duration_sec: 1842,
    orientation: 'landscape',
    ingest_status: 'completed',
    checksum: 'sha256',
    captured_at: '2026-03-31T10:00:00Z',
  },
  clip_candidate: {
    id: 'clip_xxx',
    source_media_id: 'med_xxx',
    start_ms: 120000,
    end_ms: 152000,
    speaker: 'Founder',
    topic_tags: ['hooks', 'lead generation'],
    proof_tags: ['client_result'],
    score: {
      hook_potential: 0.86,
      proof_strength: 0.74,
      visual_strength: 0.68,
      cta_fit: 0.8,
    },
    recommended_use: ['reel', 'testimonial', 'objection_clip'],
  },
  shoot_schedule: {
    id: 'sht_xxx',
    calendar_entry_id: 'pkg_xxx',
    client_id: 'cli_xxx',
    campaign_id: 'cmp_xxx',
    owner: 'Production lead',
    shoot_date: '2026-04-02',
    location: 'Main studio',
    format: 'talking_head',
    status: 'ready_to_shoot',
    talent: ['Founder'],
    shot_requirements: ['Open with a direct-to-camera pain statement.'],
  },
  script: {
    id: 'scr_xxx',
    client_id: 'cli_xxx',
    campaign_id: 'cmp_xxx',
    topic_brief_id: 'tpc_xxx',
    format: 'talking_head',
    hook_text: 'Your videos die in the first 3 seconds.',
    body_bullets: [
      'You need a visual hook.',
      'You need a text hook.',
      'You need a spoken hook.',
    ],
    cta_id: 'cta_xxx',
    approval_status: 'approved',
    version: 3,
  },
  published_post: {
    id: 'pst_xxx',
    content_asset_id: 'ast_xxx',
    client_id: 'cli_xxx',
    platform: 'instagram',
    publish_method: 'simulate',
    adapter_mode: 'simulate',
    platform_payload: {},
    platform_post_id: '1789...',
    post_url: 'https://...',
    cta_id: 'cta_xxx',
    landing_page_id: 'lpg_xxx',
    published_at: '2026-03-31T18:00:00Z',
    status: 'published',
  },
  landing_page: {
    id: 'lpg_xxx',
    client_id: 'cli_xxx',
    offer_id: 'off_xxx',
    campaign_id: 'cmp_xxx',
    type: 'booking',
    name: 'OTG Strategy Call Page',
    slug: 'otg-strategy-call',
    page_url: 'https://...',
    cta_id: 'cta_xxx',
    cta_keyword: 'GUIDE',
    status: 'active',
  },
  lead: {
    id: 'led_xxx',
    client_id: 'cli_xxx',
    ghl_contact_id: 'string',
    first_touch_post_id: 'pst_xxx',
    last_touch_post_id: 'pst_yyy',
    landing_page_id: 'lpg_xxx',
    cta_id: 'cta_xxx',
    quality_score: 0.79,
    status: 'new',
  },
  attribution_touch: {
    id: 'att_xxx',
    client_id: 'cli_xxx',
    campaign_id: 'cmp_xxx',
    content_asset_id: 'ast_xxx',
    published_post_id: 'pst_xxx',
    platform: 'instagram',
    cta_id: 'cta_xxx',
    cta_keyword: 'GUIDE',
    landing_page_id: 'lpg_xxx',
    lead_id: 'led_xxx',
    touch_type: 'form_submitted',
    utm_source: 'instagram',
    utm_medium: 'organic_social',
    utm_campaign: 'hook-test-a',
    first_touch_timestamp: '2026-03-31T18:10:00Z',
    last_touch_timestamp: '2026-03-31T18:10:00Z',
  },
  opportunity: {
    id: 'opp_xxx',
    client_id: 'cli_xxx',
    ghl_opportunity_id: 'string',
    lead_id: 'led_xxx',
    stage: 'booked_call',
    pipeline: 'main_sales',
    value: 2500,
    status: 'open',
  },
  edit_job: {
    id: 'edt_xxx',
    calendar_entry_id: 'pkg_xxx',
    client_id: 'cli_xxx',
    campaign_id: 'cmp_xxx',
    edit_lane: 'resolve',
    editor: 'Editor Name',
    edit_tier: 'basic',
    source_media_ids: ['med_xxx'],
    status: 'queued',
  },
  render_job: {
    id: 'rnd_xxx',
    edit_job_id: 'edt_xxx',
    client_id: 'cli_xxx',
    content_asset_id: 'ast_xxx',
    output_targets: ['instagram_reel', 'tiktok_vertical'],
    public_media_url: 'https://cdn.example.com/renders/rnd_xxx/instagram.mp4',
    output_urls: {
      instagram: 'https://cdn.example.com/renders/rnd_xxx/instagram.mp4',
      tiktok: 'https://cdn.example.com/renders/rnd_xxx/tiktok.mp4',
    },
    status: 'queued',
  },
  event_envelope: {
    event_id: 'evt_xxx',
    event_name: 'post.published',
    entity_type: 'published_post',
    entity_id: 'pst_xxx',
    occurred_at: '2026-03-31T18:00:00Z',
    source_system: 'publishing_gateway',
    idempotency_key: 'string',
    payload: {},
  },
};

export const STATE_MACHINES = {
  source_media: {
    states: ['uploaded', 'ingested', 'transcribed', 'segmented', 'clip_candidates_created', 'approved_for_use', 'archived'],
    failure_states: ['ingest_failed', 'transcription_failed', 'segmentation_failed'],
  },
  script: {
    states: ['draft', 'qa_review', 'approved', 'production_ready', 'rejected', 'archived'],
    failure_states: [],
  },
  edit_render: {
    states: ['queued', 'processing', 'rendered', 'qa_review', 'approved', 'published_ready', 'published'],
    failure_states: ['render_failed', 'qa_failed', 'publish_failed'],
  },
  shoot_schedule: {
    states: ['ready_to_shoot', 'shoot_scheduled', 'shot', 'handoff_to_edit', 'archived'],
    failure_states: ['shoot_blocked'],
  },
  lead: {
    states: ['new', 'qualified', 'booked', 'showed', 'proposal_sent', 'closed_won', 'closed_lost'],
    failure_states: [],
  },
};

export const CORE_EVENT_NAMES = [
  'client.updated',
  'offer.updated',
  'media.uploaded',
  'media.ingested',
  'media.transcribed',
  'media.segmented',
  'clip.created',
  'script.created',
  'script.approved',
  'editjob.created',
  'renderjob.completed',
  'contentasset.approved',
  'post.published',
  'post.publish_failed',
  'cta.triggered',
  'landingpage.visited',
  'form.submitted',
  'lead.created',
  'opportunity.created',
  'appointment.booked',
  'appointment.attended',
  'sale.closed_won',
  'sale.closed_lost',
  'metric.snapshot_recorded',
];

export const CANONICAL_EVENT_CHAIN = [
  'media.uploaded',
  'media.ingested',
  'media.transcribed',
  'media.segmented',
  'clip.created',
  'script.created',
  'script.approved',
  'editjob.created',
  'renderjob.completed',
  'contentasset.approved',
  'post.published',
  'landingpage.visited',
  'form.submitted',
  'lead.created',
  'opportunity.created',
  'appointment.booked',
  'appointment.attended',
  'sale.closed_won',
];

export function createCanonicalId(entityName) {
  const prefix = ENTITY_ID_PREFIXES[entityName] || 'gen_';
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function withSystemFields(record = {}, options = {}) {
  const now = new Date().toISOString();
  return {
    version: record.version || options.version || 1,
    created_at: record.created_at || options.created_at || now,
    updated_at: options.updated_at || now,
    created_by: record.created_by || options.created_by || 'system',
    source_system: record.source_system || options.source_system || 'agent-os',
  };
}

export function buildCanonicalDataModelContext() {
  const lines = [
    '[CANONICAL DATA MODEL]',
    'Use globally unique string IDs with canonical prefixes.',
    `Required write metadata: ${REQUIRED_SYSTEM_FIELDS.join(', ')}`,
  ];

  Object.entries(CANONICAL_ENTITIES).forEach(([group, entities]) => {
    lines.push(`${group.toUpperCase()}: ${entities.join(', ')}`);
  });

  lines.push('ID PREFIXES:');
  Object.entries(ENTITY_ID_PREFIXES).forEach(([entity, prefix]) => {
    lines.push(`- ${entity}: ${prefix}`);
  });
  lines.push('KEY SCHEMAS:');
  Object.entries(CANONICAL_SCHEMAS).forEach(([entity, schema]) => {
    lines.push(`- ${entity}: ${JSON.stringify(schema)}`);
  });
  lines.push('STATE MACHINES:');
  Object.entries(STATE_MACHINES).forEach(([entity, machine]) => {
    lines.push(`- ${entity}: states=${machine.states.join(' -> ')}; failures=${machine.failure_states.join(', ') || 'none'}`);
  });
  lines.push(`CORE EVENTS: ${CORE_EVENT_NAMES.join(' | ')}`);
  lines.push(`CANONICAL EVENT CHAIN: ${CANONICAL_EVENT_CHAIN.join(' -> ')}`);
  lines.push('[END CANONICAL DATA MODEL]');
  return lines.join('\n');
}
