import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { emitEvent } from './eventLog.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'funnel-records.json');

export const LANDING_PAGE_TYPES = ['lead_magnet', 'booking', 'service', 'proof_case_study', 'retargeting'];
export const LEAD_STATES = ['new', 'qualified', 'booked', 'showed', 'proposal_sent', 'closed_won', 'closed_lost'];

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      landing_pages: [],
      leads: [],
      opportunities: [],
      attribution_touches: [],
      lastUpdated: null,
    }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return { landing_pages: [], leads: [], opportunities: [], attribution_touches: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function normalizeLandingPage(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'landing_page_service',
  });
  return {
    id: input.id || createCanonicalId('landing_page'),
    client_id: String(input.client_id || 'cli_default').trim(),
    offer_id: String(input.offer_id || 'off_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    type: LANDING_PAGE_TYPES.includes(input.type) ? input.type : 'booking',
    name: String(input.name || input.title || 'Landing Page').trim(),
    slug: String(input.slug || 'landing-page').trim(),
    page_url: String(input.page_url || '').trim(),
    cta_id: String(input.cta_id || 'cta_default').trim(),
    cta_keyword: String(input.cta_keyword || 'GUIDE').trim(),
    status: String(input.status || 'draft').trim(),
    headline: String(input.headline || '').trim(),
    subheadline: String(input.subheadline || '').trim(),
    primary_outcome: String(input.primary_outcome || 'booked sales calls').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeLead(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'attribution_service',
  });
  const status = LEAD_STATES.includes(input.status) ? input.status : 'new';
  return {
    id: input.id || createCanonicalId('lead'),
    client_id: String(input.client_id || 'cli_default').trim(),
    ghl_contact_id: String(input.ghl_contact_id || '').trim(),
    first_touch_post_id: String(input.first_touch_post_id || '').trim(),
    last_touch_post_id: String(input.last_touch_post_id || input.first_touch_post_id || '').trim(),
    landing_page_id: String(input.landing_page_id || 'lpg_default').trim(),
    cta_id: String(input.cta_id || 'cta_default').trim(),
    cta_keyword: String(input.cta_keyword || '').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    content_asset_id: String(input.content_asset_id || '').trim(),
    platform: String(input.platform || 'instagram').trim(),
    quality_score: Number.isFinite(Number(input.quality_score)) ? Number(input.quality_score) : 0,
    status,
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim(),
    phone: String(input.phone || '').trim(),
    qualified: !!input.qualified,
    qualification_notes: String(input.qualification_notes || '').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeOpportunity(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'crm_sync',
  });
  return {
    id: input.id || createCanonicalId('opportunity'),
    client_id: String(input.client_id || 'cli_default').trim(),
    ghl_opportunity_id: String(input.ghl_opportunity_id || '').trim(),
    lead_id: String(input.lead_id || 'led_default').trim(),
    stage: String(input.stage || 'booked_call').trim(),
    pipeline: String(input.pipeline || 'main_sales').trim(),
    value: Number.isFinite(Number(input.value)) ? Number(input.value) : 0,
    status: String(input.status || 'open').trim(),
    appointment_id: String(input.appointment_id || '').trim(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeAttributionTouch(input = {}) {
  const system = withSystemFields(input, {
    created_by: input.created_by || 'system',
    source_system: input.source_system || 'attribution_service',
  });
  return {
    id: input.id || createCanonicalId('attribution_touch'),
    client_id: String(input.client_id || 'cli_default').trim(),
    campaign_id: String(input.campaign_id || 'cmp_default').trim(),
    content_asset_id: String(input.content_asset_id || '').trim(),
    published_post_id: String(input.published_post_id || '').trim(),
    platform: String(input.platform || 'instagram').trim(),
    cta_id: String(input.cta_id || 'cta_default').trim(),
    cta_keyword: String(input.cta_keyword || '').trim(),
    landing_page_id: String(input.landing_page_id || 'lpg_default').trim(),
    lead_id: String(input.lead_id || '').trim(),
    touch_type: String(input.touch_type || 'landing_page_visit').trim(),
    utm_source: String(input.utm_source || '').trim(),
    utm_medium: String(input.utm_medium || '').trim(),
    utm_campaign: String(input.utm_campaign || '').trim(),
    first_touch_timestamp: input.first_touch_timestamp || new Date().toISOString(),
    last_touch_timestamp: input.last_touch_timestamp || input.first_touch_timestamp || new Date().toISOString(),
    ...system,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function listLandingPages(filters = {}) {
  let records = loadData().landing_pages;
  if (filters.client_id) records = records.filter((entry) => entry.client_id === filters.client_id);
  if (filters.campaign_id) records = records.filter((entry) => entry.campaign_id === filters.campaign_id);
  return records;
}

export function addLandingPage(input = {}) {
  const data = loadData();
  const record = normalizeLandingPage(input);
  data.landing_pages.unshift(record);
  saveData(data);
  return record;
}

export function findBestLandingPageMatch(filters = {}) {
  const pages = listLandingPages(filters);
  if (!pages.length) return null;

  const scored = pages.map((page) => {
    let score = 0;
    if (filters.client_id && page.client_id === filters.client_id) score += 3;
    if (filters.campaign_id && page.campaign_id === filters.campaign_id) score += 3;
    if (filters.cta_id && page.cta_id === filters.cta_id) score += 4;
    if (filters.offer_id && page.offer_id === filters.offer_id) score += 2;
    return { page, score };
  }).sort((a, b) => b.score - a.score || new Date(b.page.createdAt || b.page.created_at || 0) - new Date(a.page.createdAt || a.page.created_at || 0));

  return scored[0]?.page || null;
}

export function listLeads(filters = {}) {
  let records = loadData().leads;
  if (filters.client_id) records = records.filter((entry) => entry.client_id === filters.client_id);
  if (filters.landing_page_id) records = records.filter((entry) => entry.landing_page_id === filters.landing_page_id);
  if (filters.cta_id) records = records.filter((entry) => entry.cta_id === filters.cta_id);
  return records;
}

export function addLead(input = {}) {
  const data = loadData();
  const lead = normalizeLead(input);
  data.leads.unshift(lead);
  saveData(data);
  emitEvent('lead.created', 'lead', lead.id, {
    client_id: lead.client_id,
    landing_page_id: lead.landing_page_id,
    cta_id: lead.cta_id,
    status: lead.status,
  }, { source_system: lead.source_system });
  return lead;
}

export function updateLead(id, updates = {}) {
  const data = loadData();
  const lead = data.leads.find((entry) => entry.id === id);
  if (!lead) throw new Error('Lead not found');
  const nextStatus = updates.status && LEAD_STATES.includes(updates.status) ? updates.status : lead.status;
  Object.assign(lead, {
    ghl_contact_id: updates.ghl_contact_id ?? lead.ghl_contact_id,
    first_touch_post_id: updates.first_touch_post_id ?? lead.first_touch_post_id,
    last_touch_post_id: updates.last_touch_post_id ?? lead.last_touch_post_id,
    landing_page_id: updates.landing_page_id ?? lead.landing_page_id,
    cta_id: updates.cta_id ?? lead.cta_id,
    cta_keyword: updates.cta_keyword ?? lead.cta_keyword,
    campaign_id: updates.campaign_id ?? lead.campaign_id,
    content_asset_id: updates.content_asset_id ?? lead.content_asset_id,
    platform: updates.platform ?? lead.platform,
    quality_score: updates.quality_score !== undefined ? Number(updates.quality_score) : lead.quality_score,
    status: nextStatus,
    name: updates.name ?? lead.name,
    email: updates.email ?? lead.email,
    phone: updates.phone ?? lead.phone,
    qualified: updates.qualified !== undefined ? !!updates.qualified : lead.qualified,
    qualification_notes: updates.qualification_notes ?? lead.qualification_notes,
    version: Number(lead.version || 1) + 1,
    updated_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveData(data);
  return lead;
}

export function listOpportunities(filters = {}) {
  let records = loadData().opportunities;
  if (filters.client_id) records = records.filter((entry) => entry.client_id === filters.client_id);
  if (filters.lead_id) records = records.filter((entry) => entry.lead_id === filters.lead_id);
  return records;
}

export function addOpportunity(input = {}) {
  const data = loadData();
  const opportunity = normalizeOpportunity(input);
  data.opportunities.unshift(opportunity);
  saveData(data);
  emitEvent('opportunity.created', 'opportunity', opportunity.id, {
    client_id: opportunity.client_id,
    lead_id: opportunity.lead_id,
    stage: opportunity.stage,
    value: opportunity.value,
  }, { source_system: opportunity.source_system });
  return opportunity;
}

export function updateOpportunity(id, updates = {}) {
  const data = loadData();
  const opportunity = data.opportunities.find((entry) => entry.id === id);
  if (!opportunity) throw new Error('Opportunity not found');
  Object.assign(opportunity, {
    ghl_opportunity_id: updates.ghl_opportunity_id ?? opportunity.ghl_opportunity_id,
    lead_id: updates.lead_id ?? opportunity.lead_id,
    stage: updates.stage ?? opportunity.stage,
    pipeline: updates.pipeline ?? opportunity.pipeline,
    value: updates.value !== undefined ? Number(updates.value) : opportunity.value,
    status: updates.status ?? opportunity.status,
    appointment_id: updates.appointment_id ?? opportunity.appointment_id,
    version: Number(opportunity.version || 1) + 1,
    updated_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  saveData(data);
  if (opportunity.stage === 'booked_call') {
    emitEvent('appointment.booked', 'opportunity', opportunity.id, {
      lead_id: opportunity.lead_id,
      value: opportunity.value,
    }, { source_system: updates.source_system || 'crm_sync' });
  }
  if (opportunity.stage === 'showed') {
    emitEvent('appointment.attended', 'opportunity', opportunity.id, {
      lead_id: opportunity.lead_id,
      value: opportunity.value,
    }, { source_system: updates.source_system || 'crm_sync' });
  }
  if (opportunity.status === 'won' || opportunity.stage === 'closed_won') {
    emitEvent('sale.closed_won', 'opportunity', opportunity.id, {
      lead_id: opportunity.lead_id,
      value: opportunity.value,
    }, { source_system: updates.source_system || 'crm_sync' });
  }
  if (opportunity.status === 'lost' || opportunity.stage === 'closed_lost') {
    emitEvent('sale.closed_lost', 'opportunity', opportunity.id, {
      lead_id: opportunity.lead_id,
      value: opportunity.value,
    }, { source_system: updates.source_system || 'crm_sync' });
  }
  return opportunity;
}

export function listAttributionTouches(filters = {}) {
  let records = loadData().attribution_touches;
  if (filters.client_id) records = records.filter((entry) => entry.client_id === filters.client_id);
  if (filters.lead_id) records = records.filter((entry) => entry.lead_id === filters.lead_id);
  if (filters.landing_page_id) records = records.filter((entry) => entry.landing_page_id === filters.landing_page_id);
  return records;
}

export function addAttributionTouch(input = {}) {
  const data = loadData();
  const touch = normalizeAttributionTouch(input);
  data.attribution_touches.unshift(touch);
  saveData(data);
  if (touch.touch_type === 'cta_triggered') {
    emitEvent('cta.triggered', 'attribution_touch', touch.id, {
      cta_id: touch.cta_id,
      landing_page_id: touch.landing_page_id,
      published_post_id: touch.published_post_id,
    }, { source_system: touch.source_system });
  }
  if (touch.touch_type === 'landing_page_visit') {
    emitEvent('landingpage.visited', 'landing_page', touch.landing_page_id, {
      attribution_touch_id: touch.id,
      published_post_id: touch.published_post_id,
    }, { source_system: touch.source_system });
  }
  if (touch.touch_type === 'form_submitted') {
    emitEvent('form.submitted', 'landing_page', touch.landing_page_id, {
      attribution_touch_id: touch.id,
      lead_id: touch.lead_id,
    }, { source_system: touch.source_system });
  }
  return touch;
}

function rate(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

export function buildFunnelDashboard(filters = {}) {
  const landingPages = listLandingPages(filters);
  const leads = listLeads(filters);
  const opportunities = listOpportunities(filters);
  const touches = listAttributionTouches(filters);

  const bookedLeadIds = new Set(
    opportunities
      .filter((opportunity) => opportunity.stage === 'booked_call' || opportunity.stage === 'showed' || opportunity.stage === 'proposal_sent' || opportunity.status === 'won')
      .map((opportunity) => opportunity.lead_id)
      .filter(Boolean)
  );

  const wonLeadIds = new Set(
    opportunities
      .filter((opportunity) => opportunity.status === 'won' || opportunity.stage === 'closed_won')
      .map((opportunity) => opportunity.lead_id)
      .filter(Boolean)
  );

  const visits = touches.filter((touch) => touch.touch_type === 'landing_page_visit');
  const formSubmits = touches.filter((touch) => touch.touch_type === 'form_submitted');
  const ctaTriggers = touches.filter((touch) => touch.touch_type === 'cta_triggered');
  const qualifiedLeads = leads.filter((lead) => lead.qualified || lead.status === 'qualified');
  const bookedLeads = leads.filter((lead) => bookedLeadIds.has(lead.id) || lead.status === 'booked' || lead.status === 'showed');
  const wonLeads = leads.filter((lead) => wonLeadIds.has(lead.id) || lead.status === 'closed_won');

  const overview = {
    landingPages: landingPages.length,
    visits: visits.length,
    ctaTriggers: ctaTriggers.length,
    formSubmits: formSubmits.length,
    leads: leads.length,
    qualifiedLeads: qualifiedLeads.length,
    bookedLeads: bookedLeads.length,
    wonLeads: wonLeads.length,
    pipelineValue: Number(opportunities.reduce((sum, entry) => sum + Number(entry.value || 0), 0).toFixed(2)),
    visitToLeadRate: rate(leads.length, visits.length),
    leadToBookedRate: rate(bookedLeads.length, leads.length),
    leadToWonRate: rate(wonLeads.length, leads.length),
  };

  const byLandingPage = landingPages.map((page) => {
    const pageVisits = visits.filter((touch) => touch.landing_page_id === page.id).length;
    const pageLeads = leads.filter((lead) => lead.landing_page_id === page.id);
    const pageOpportunities = opportunities.filter((opportunity) => pageLeads.some((lead) => lead.id === opportunity.lead_id));
    return {
      id: page.id,
      name: page.name,
      type: page.type,
      ctaId: page.cta_id,
      pageUrl: page.page_url,
      visits: pageVisits,
      leads: pageLeads.length,
      opportunities: pageOpportunities.length,
      pipelineValue: Number(pageOpportunities.reduce((sum, entry) => sum + Number(entry.value || 0), 0).toFixed(2)),
      visitToLeadRate: rate(pageLeads.length, pageVisits),
    };
  }).sort((a, b) => b.pipelineValue - a.pipelineValue || b.leads - a.leads);

  const byCta = Object.values(leads.reduce((acc, lead) => {
    const key = lead.cta_id || 'cta_unknown';
    if (!acc[key]) {
      acc[key] = {
        ctaId: key,
        keyword: lead.cta_keyword || '',
        leads: 0,
        qualified: 0,
        booked: 0,
        won: 0,
      };
    }
    acc[key].leads += 1;
    if (lead.qualified || lead.status === 'qualified') acc[key].qualified += 1;
    if (bookedLeadIds.has(lead.id) || lead.status === 'booked' || lead.status === 'showed') acc[key].booked += 1;
    if (wonLeadIds.has(lead.id) || lead.status === 'closed_won') acc[key].won += 1;
    return acc;
  }, {})).map((entry) => ({
    ...entry,
    qualifiedRate: rate(entry.qualified, entry.leads),
    bookedRate: rate(entry.booked, entry.leads),
    wonRate: rate(entry.won, entry.leads),
  })).sort((a, b) => b.booked - a.booked || b.leads - a.leads);

  const byCampaign = Object.values(leads.reduce((acc, lead) => {
    const key = lead.campaign_id || 'cmp_unknown';
    if (!acc[key]) {
      acc[key] = {
        campaignId: key,
        leads: 0,
        qualified: 0,
        booked: 0,
        won: 0,
        pipelineValue: 0,
      };
    }
    acc[key].leads += 1;
    if (lead.qualified || lead.status === 'qualified') acc[key].qualified += 1;
    if (bookedLeadIds.has(lead.id) || lead.status === 'booked' || lead.status === 'showed') acc[key].booked += 1;
    if (wonLeadIds.has(lead.id) || lead.status === 'closed_won') acc[key].won += 1;
    const linkedOpps = opportunities.filter((opportunity) => opportunity.lead_id === lead.id);
    acc[key].pipelineValue += linkedOpps.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
    return acc;
  }, {})).map((entry) => ({
    ...entry,
    pipelineValue: Number(entry.pipelineValue.toFixed(2)),
    bookedRate: rate(entry.booked, entry.leads),
    wonRate: rate(entry.won, entry.leads),
  })).sort((a, b) => b.pipelineValue - a.pipelineValue || b.leads - a.leads);

  const recentLeads = leads.slice(0, 12).map((lead) => ({
    id: lead.id,
    name: lead.name || 'Unnamed lead',
    status: lead.status,
    qualityScore: lead.quality_score,
    campaignId: lead.campaign_id,
    ctaId: lead.cta_id,
    landingPageId: lead.landing_page_id,
    createdAt: lead.createdAt || lead.created_at,
  }));

  return {
    filters,
    overview,
    byLandingPage,
    byCta,
    byCampaign,
    recentLeads,
    recentOpportunities: opportunities.slice(0, 12),
  };
}
