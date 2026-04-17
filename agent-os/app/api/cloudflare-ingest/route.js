import { emitEvent, listEvents } from '../../../lib/eventLog.js';
import { getLeadProspectById, loadLeadProspects, updateLeadProspect, upsertLeadProspects } from '../../../lib/leadProspects.js';
import { getProspectRadarSummary, upsertOpportunities } from '../../../lib/prospectRadar.js';
import { addClientRecord, setActiveClientRecord } from '../../../lib/clientStore.js';
import { getResearchSummary, loadResearchData, upsertImportedVideos } from '../../../lib/viralResearch.js';

export const dynamic = 'force-dynamic';

function isAuthorized(request) {
  const configuredSecret = process.env.CLOUDFLARE_INGEST_SECRET || '';
  if (!configuredSecret) return true;
  const provided = request.headers.get('x-ingest-secret') || '';
  return provided && provided === configuredSecret;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function maskEmail(value = '') {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const visible = name.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(0, name.length - visible.length))}@${domain}`;
}

function maskPhone(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***-***-${digits.slice(-4)}`;
}

function sanitizeProspectForRead(prospect = {}, full = false) {
  if (full) return prospect;
  return {
    ...prospect,
    publicEmail: prospect.publicEmail ? maskEmail(prospect.publicEmail) : '',
    publicPhone: prospect.publicPhone ? maskPhone(prospect.publicPhone) : '',
  };
}

function validateViralRecord(record = {}) {
  const errors = [];
  const platform = String(record.platform || '').trim().toLowerCase();
  const url = String(record.url || '').trim();
  const topic = String(record.topic || record.subject || '').trim();

  if (!platform) errors.push('platform is required');
  if (!url) errors.push('url is required');
  if (url && !/^https?:\/\//i.test(url)) errors.push('url must be an absolute http(s) URL');
  if (!topic) errors.push('topic or subject is required');

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateLeadProspectRecord(record = {}) {
  const errors = [];
  const businessName = String(record.businessName || record.name || '').trim();
  const website = String(record.website || '').trim();
  const email = String(record.publicEmail || record.email || '').trim();
  const phone = String(record.publicPhone || record.phone || '').trim();

  if (!businessName) errors.push('businessName is required');
  if (!website && !email && !phone) errors.push('at least one contact point is required: website, email, or phone');
  if (website && !/^https?:\/\//i.test(website)) errors.push('website must be an absolute http(s) URL');

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateProspectOpportunityRecord(record = {}) {
  const errors = [];
  const title = String(record.title || '').trim();
  const sourceUrl = String(record.sourceUrl || record.url || '').trim();
  const niche = String(record.niche || record.requestedService || record.service || '').trim();

  if (!title) errors.push('title is required');
  if (!sourceUrl) errors.push('sourceUrl is required');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) errors.push('sourceUrl must be an absolute http(s) URL');
  if (!niche) errors.push('niche or requestedService is required');

  return {
    valid: errors.length === 0,
    errors,
  };
}

function buildRejectEventName(recordType = 'unknown') {
  if (recordType === 'viral_research') return 'cloudflare.viral.rejected';
  if (recordType === 'lead_prospect') return 'cloudflare.prospect.rejected';
  if (recordType === 'prospect_opportunity') return 'cloudflare.opportunity.rejected';
  return 'cloudflare.record.rejected';
}

function getCloudflareEvents(limit = 20) {
  return listEvents()
    .filter((event) => String(event?.event_name || '').startsWith('cloudflare.'))
    .slice(0, limit);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'summary';
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 12)));
    const full = searchParams.get('full') === 'true';
    if (full && !isAuthorized(request)) {
      return Response.json({ error: 'Unauthorized full ingest read' }, { status: 401 });
    }

    const researchData = loadResearchData();
    const leadData = loadLeadProspects();
    const recentEvents = getCloudflareEvents(limit);

    if (action === 'events') {
      return Response.json({ events: recentEvents });
    }

    if (action === 'viral') {
      return Response.json({
        summary: getResearchSummary(),
        records: (researchData.videos || []).slice(0, limit),
      });
    }

    if (action === 'prospects') {
      return Response.json({
        total: leadData.prospects?.length || 0,
        records: (leadData.prospects || []).slice(0, limit).map((item) => sanitizeProspectForRead(item, full)),
      });
    }

    return Response.json({
      summary: {
        viralRecords: researchData.videos?.length || 0,
        leadProspects: leadData.prospects?.length || 0,
        prospectOpportunities: getProspectRadarSummary().total || 0,
        lastViralImportAt: researchData.lastUpdated || null,
        lastLeadImportAt: leadData.lastUpdated || null,
        recentEvents: recentEvents.length,
      },
      viralResearch: {
        summary: getResearchSummary(),
        records: (researchData.videos || []).slice(0, limit),
      },
      leadProspects: {
        total: leadData.prospects?.length || 0,
        records: (leadData.prospects || []).slice(0, limit).map((item) => sanitizeProspectForRead(item, full)),
      },
      events: recentEvents,
      payloadExamples: {
        viralResearch: {
          recordType: 'viral_research',
          platform: 'tiktok',
          url: 'https://www.tiktok.com/@creator/video/1234567890',
          creatorHandle: '@creator',
          topic: 'dog training',
          cta: 'Book a consultation',
          publishedAt: '2026-03-31T18:00:00Z',
          source: 'cloudflare-worker',
        },
        leadProspect: {
          recordType: 'lead_prospect',
          businessName: 'Happy Paws Dog Training',
          website: 'https://happypaws.example.com',
          email: 'owner@happypaws.example.com',
          phone: '+1-555-0100',
          niche: 'dog training',
          geography: 'Orange County, CA',
          source: 'cloudflare-worker',
        },
        prospectOpportunity: {
          recordType: 'prospect_opportunity',
          title: 'Looking for a wedding photographer for October 12 in Orange County',
          niche: 'wedding photography',
          requestedService: 'wedding photographer',
          sourcePlatform: 'public-facebook',
          sourceUrl: 'https://example.com/post/123',
          location: 'Orange County, CA',
          postedAt: '2026-04-08T10:00:00Z',
          summary: 'Need someone available for an October wedding. Budget is flexible for the right fit.',
        },
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body?.action === 'promoteProspectToClient') {
      const prospectId = String(body.prospectId || '').trim();
      if (!prospectId) {
        return Response.json({ error: 'Missing prospectId' }, { status: 400 });
      }

      const prospect = getLeadProspectById(prospectId);
      if (!prospect) {
        return Response.json({ error: 'Prospect not found' }, { status: 404 });
      }

      const clientName = prospect.businessName || prospect.website || 'Imported Prospect';
      const promoted = addClientRecord({
        name: clientName,
        business_name: prospect.businessName || clientName,
        niche: prospect.niche || '',
        website: prospect.website || '',
        service_area: prospect.geography || '',
        email: prospect.publicEmail || '',
        phone: prospect.publicPhone || '',
        notes: [
          'Imported from Cloudflare lead prospect intake.',
          prospect.notes ? `Prospect notes: ${prospect.notes}` : '',
        ].filter(Boolean).join('\n'),
        research_summary: prospect.notes || '',
        onboarding_status: 'draft',
        crm_setup_status: 'not_started',
        managed_site_status: 'not_started',
        funnel_tracking_status: 'not_started',
        source_system: 'cloudflare_ingest',
      });

      if (body.setActive !== false) {
        setActiveClientRecord(promoted.client.id);
      }

      updateLeadProspect(prospectId, {
        promotedToClientId: promoted.client.id,
        promotedAt: new Date().toISOString(),
        status: 'promoted',
      });

      emitEvent(
        'cloudflare.prospect.promoted',
        'client',
        promoted.client.id,
        { prospectId, clientName: promoted.client.name },
        { source_system: 'cloudflare_ingest' }
      );

      return Response.json({
        success: true,
        client: promoted.client,
        prospectId,
      });
    }

    if (!isAuthorized(request)) {
      emitEvent(
        'cloudflare.auth.rejected',
        'cloudflare_ingest',
        'auth',
        { reason: 'invalid_secret' },
        { source_system: 'cloudflare_ingest' }
      );
      return Response.json({ error: 'Unauthorized ingest request' }, { status: 401 });
    }

    const records = toArray(body?.records || body?.record);
    if (!records.length) {
      return Response.json({ error: 'Missing record payload' }, { status: 400 });
    }

    const acceptedViralRecords = [];
    const acceptedLeadRecords = [];
    const acceptedOpportunityRecords = [];
    const rejectedRecords = [];
    const perRecordResults = [];

    records.forEach((record, index) => {
      const recordType = record?.recordType;
      let validation = { valid: false, errors: ['recordType is required'] };

      if (recordType === 'viral_research') validation = validateViralRecord(record);
      if (recordType === 'lead_prospect') validation = validateLeadProspectRecord(record);
      if (recordType === 'prospect_opportunity') validation = validateProspectOpportunityRecord(record);
      if (!['viral_research', 'lead_prospect', 'prospect_opportunity'].includes(recordType)) {
        validation = { valid: false, errors: ['recordType must be viral_research, lead_prospect, or prospect_opportunity'] };
      }

      if (!validation.valid) {
        rejectedRecords.push({ index, recordType: recordType || 'unknown', errors: validation.errors, record });
        perRecordResults.push({
          index,
          recordType: recordType || 'unknown',
          status: 'rejected',
          errors: validation.errors,
        });
        emitEvent(
          buildRejectEventName(recordType),
          recordType || 'unknown_record',
          `rejected-${Date.now()}-${index}`,
          { index, errors: validation.errors, recordType: recordType || 'unknown' },
          { source_system: 'cloudflare_ingest' }
        );
        return;
      }

      if (recordType === 'viral_research') acceptedViralRecords.push({ index, record });
      if (recordType === 'lead_prospect') acceptedLeadRecords.push({ index, record });
      if (recordType === 'prospect_opportunity') acceptedOpportunityRecords.push({ index, record });
    });

    const viralResults = acceptedViralRecords.length ? upsertImportedVideos(acceptedViralRecords.map((item) => item.record)) : [];
    const leadResults = acceptedLeadRecords.length ? upsertLeadProspects(acceptedLeadRecords.map((item) => item.record)) : [];
    const opportunityResults = acceptedOpportunityRecords.length ? upsertOpportunities(acceptedOpportunityRecords.map((item) => item.record)) : [];

    viralResults.forEach(({ video, created }, resultIndex) => {
      const sourceIndex = acceptedViralRecords[resultIndex]?.index ?? resultIndex;
      emitEvent(
        created ? 'cloudflare.viral.created' : 'cloudflare.viral.updated',
        'viral_research',
        video.id,
        { platform: video.platform, url: video.url },
        { source_system: 'cloudflare_ingest' }
      );
      perRecordResults.push({
        index: sourceIndex,
        recordType: 'viral_research',
        status: created ? 'created' : 'updated',
        id: video.id,
        url: video.url,
      });
    });

    leadResults.forEach(({ prospect, created }, resultIndex) => {
      const sourceIndex = acceptedLeadRecords[resultIndex]?.index ?? resultIndex;
      emitEvent(
        created ? 'cloudflare.prospect.created' : 'cloudflare.prospect.updated',
        'lead_prospect',
        prospect.id,
        { businessName: prospect.businessName, website: prospect.website },
        { source_system: 'cloudflare_ingest' }
      );
      perRecordResults.push({
        index: sourceIndex,
        recordType: 'lead_prospect',
        status: created ? 'created' : 'updated',
        id: prospect.id,
        website: prospect.website,
      });
    });

    opportunityResults.forEach(({ opportunity, created }, resultIndex) => {
      const sourceIndex = acceptedOpportunityRecords[resultIndex]?.index ?? resultIndex;
      emitEvent(
        created ? 'cloudflare.opportunity.created' : 'cloudflare.opportunity.updated',
        'prospect_opportunity',
        opportunity.id,
        { title: opportunity.title, sourceUrl: opportunity.sourceUrl },
        { source_system: 'cloudflare_ingest' }
      );
      perRecordResults.push({
        index: sourceIndex,
        recordType: 'prospect_opportunity',
        status: created ? 'created' : 'updated',
        id: opportunity.id,
        url: opportunity.sourceUrl,
      });
    });

    return Response.json({
      success: true,
      received: records.length,
      viralResearch: {
        received: acceptedViralRecords.length,
        created: viralResults.filter((item) => item.created).length,
        updated: viralResults.filter((item) => !item.created).length,
      },
      leadProspects: {
        received: acceptedLeadRecords.length,
        created: leadResults.filter((item) => item.created).length,
        updated: leadResults.filter((item) => !item.created).length,
      },
      prospectOpportunities: {
        received: acceptedOpportunityRecords.length,
        created: opportunityResults.filter((item) => item.created).length,
        updated: opportunityResults.filter((item) => !item.created).length,
      },
      rejected: rejectedRecords.length,
      perRecordResults: perRecordResults.sort((a, b) => a.index - b.index),
    });
  } catch (error) {
    emitEvent(
      'cloudflare.ingest.error',
      'cloudflare_ingest',
      'route',
      { message: error.message },
      { source_system: 'cloudflare_ingest' }
    );
    return Response.json({ error: error.message }, { status: 500 });
  }
}
