import { emitEvent, listEvents } from '../../../lib/eventLog.js';
import { buildProspectSearchTemplates, getOpportunityById, getProspectRadarSummary, loadProspectRadar, updateOpportunity, upsertOpportunities } from '../../../lib/prospectRadar.js';
import { upsertLeadProspect } from '../../../lib/leadProspects.js';

export const dynamic = 'force-dynamic';

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}

function validateOpportunity(record = {}) {
  const errors = [];
  const title = String(record.title || '').trim();
  const url = String(record.sourceUrl || record.url || '').trim();
  const niche = String(record.niche || record.requestedService || record.service || '').trim();

  if (!title) errors.push('title is required');
  if (!url) errors.push('sourceUrl is required');
  if (url && !/^https?:\/\//i.test(url)) errors.push('sourceUrl must be an absolute http(s) URL');
  if (!niche) errors.push('niche or requestedService is required');

  return { valid: errors.length === 0, errors };
}

function getProspectEvents(limit = 20) {
  return listEvents()
    .filter((event) => String(event?.event_name || '').startsWith('prospect_radar.'))
    .slice(0, limit);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || 20)));
    const niche = searchParams.get('niche') || '';
    const location = searchParams.get('location') || '';
    const year = searchParams.get('year') || '';
    const category = searchParams.get('category') || 'general';
    const action = searchParams.get('action') || 'summary';

    const data = loadProspectRadar();
    const records = (data.opportunities || []).slice(0, limit);

    if (action === 'templates') {
      return Response.json({
        templates: buildProspectSearchTemplates({ niche, location, year, category }),
      });
    }

    if (action === 'records') {
      return Response.json({
        summary: getProspectRadarSummary(),
        records,
        events: getProspectEvents(limit),
      });
    }

    return Response.json({
      summary: getProspectRadarSummary(),
      records,
      events: getProspectEvents(limit),
      templates: buildProspectSearchTemplates({ niche, location, year, category }),
      payloadExample: {
        title: 'Looking for a wedding photographer for October 12 in Orange County',
        niche: 'wedding photography',
        requestedService: 'wedding photographer',
        sourcePlatform: 'public-facebook',
        sourceLabel: 'Public Facebook result',
        sourceUrl: 'https://example.com/post/123',
        location: 'Orange County, CA',
        postedAt: '2026-04-08T10:00:00Z',
        summary: 'Need someone available for an October wedding. Budget is flexible for the right fit.',
        outreachAngle: 'Lead with portfolio proof and confirm date availability fast.',
      },
      presets: [
        { id: 'weddings', label: 'Weddings', niche: 'wedding photography', year: '2027' },
        { id: 'festivals', label: 'Festivals', niche: 'festival photographer videographer', year: '2027' },
        { id: 'automotive', label: 'Automotive', niche: 'car repair mechanic body shop', year: '' },
      ],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action || 'importRecords';

    if (action === 'launchDiscovery') {
      const workerUrl = String(process.env.PROSPECT_RADAR_DISCOVERY_URL || '').trim();
      if (!workerUrl) {
        return Response.json({ error: 'Missing PROSPECT_RADAR_DISCOVERY_URL' }, { status: 400 });
      }

      const payload = {
        category: String(body.category || 'general').trim(),
        niche: String(body.niche || '').trim(),
        location: String(body.location || '').trim(),
        year: String(body.year || '').trim(),
        limit: Math.max(1, Math.min(20, Number(body.limit || 8))),
      };

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      emitEvent(
        response.ok ? 'prospect_radar.discovery_launched' : 'prospect_radar.discovery_failed',
        'opportunity',
        payload.category || 'general',
        {
          niche: payload.niche,
          location: payload.location,
          year: payload.year,
          workerUrl,
          workerStatus: response.status,
        },
        { source_system: 'agent-os' }
      );

      return Response.json({
        success: response.ok,
        workerStatus: response.status,
        payload,
        workerResponse: parsed,
      }, { status: response.ok ? 200 : 502 });
    }

    if (action === 'markOutreach') {
      const opportunityId = String(body.opportunityId || '').trim();
      if (!opportunityId) return Response.json({ error: 'Missing opportunityId' }, { status: 400 });
      const updated = updateOpportunity(opportunityId, {
        outreachStatus: String(body.outreachStatus || 'actioned'),
        status: String(body.status || 'active'),
        lastOutreachAt: new Date().toISOString(),
      });
      if (!updated) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      emitEvent('prospect_radar.outreach_marked', 'opportunity', updated.id, { outreachStatus: updated.outreachStatus }, { source_system: 'agent-os' });
      return Response.json({ success: true, opportunity: updated });
    }

    if (action === 'archive') {
      const opportunityId = String(body.opportunityId || '').trim();
      if (!opportunityId) return Response.json({ error: 'Missing opportunityId' }, { status: 400 });
      const updated = updateOpportunity(opportunityId, {
        status: 'archived',
      });
      if (!updated) return Response.json({ error: 'Opportunity not found' }, { status: 404 });
      emitEvent('prospect_radar.archived', 'opportunity', updated.id, { title: updated.title }, { source_system: 'agent-os' });
      return Response.json({ success: true, opportunity: updated });
    }

    if (action === 'saveAsLeadProspect') {
      const opportunityId = String(body.opportunityId || '').trim();
      if (!opportunityId) return Response.json({ error: 'Missing opportunityId' }, { status: 400 });
      const opportunity = getOpportunityById(opportunityId);
      if (!opportunity) return Response.json({ error: 'Opportunity not found' }, { status: 404 });

      const result = upsertLeadProspect({
        businessName: opportunity.title,
        website: opportunity.sourceUrl,
        niche: opportunity.niche || opportunity.requestedService,
        geography: opportunity.location,
        notes: [
          `Service request saved from Prospect Radar.`,
          `Source: ${opportunity.sourceLabel || opportunity.sourcePlatform}`,
          opportunity.summary ? `Summary: ${opportunity.summary}` : '',
          opportunity.eventDate ? `Event date: ${opportunity.eventDate}` : '',
          opportunity.outreachAngle ? `Suggested outreach: ${opportunity.outreachAngle}` : '',
        ].filter(Boolean).join('\n'),
        source: 'prospect_radar',
        sourceUrl: opportunity.sourceUrl,
        discoveredFrom: opportunity.discoveredFrom || opportunity.sourcePlatform,
        crawlJobId: opportunity.crawlJobId,
        rawArtifactPath: opportunity.rawArtifactPath,
        crawlTimestamp: opportunity.postedAt,
      });

      const updated = updateOpportunity(opportunityId, {
        promotedLeadId: result.prospect.id,
        outreachStatus: 'saved',
      });

      emitEvent('prospect_radar.saved_to_leads', 'opportunity', opportunityId, { leadProspectId: result.prospect.id }, { source_system: 'agent-os' });
      return Response.json({ success: true, opportunity: updated, leadProspect: result.prospect });
    }

    const records = toArray(body?.records || body?.record || body);
    if (!records.length) {
      return Response.json({ error: 'Missing opportunity record payload' }, { status: 400 });
    }

    const accepted = [];
    const rejected = [];
    const perRecordResults = [];

    records.forEach((record, index) => {
      const validation = validateOpportunity(record);
      if (!validation.valid) {
        rejected.push({ index, errors: validation.errors, record });
        perRecordResults.push({ index, status: 'rejected', errors: validation.errors });
        emitEvent('prospect_radar.rejected', 'opportunity', `rejected-${Date.now()}-${index}`, { errors: validation.errors }, { source_system: 'agent-os' });
        return;
      }
      accepted.push({ index, record });
    });

    const results = accepted.length ? upsertOpportunities(accepted.map((item) => item.record)) : [];
    results.forEach(({ opportunity, created }, idx) => {
      const sourceIndex = accepted[idx]?.index ?? idx;
      perRecordResults.push({
        index: sourceIndex,
        status: created ? 'created' : 'updated',
        id: opportunity.id,
        title: opportunity.title,
      });
      emitEvent(
        created ? 'prospect_radar.created' : 'prospect_radar.updated',
        'opportunity',
        opportunity.id,
        { title: opportunity.title, sourceUrl: opportunity.sourceUrl },
        { source_system: 'agent-os' }
      );
    });

    return Response.json({
      success: true,
      received: records.length,
      created: results.filter((item) => item.created).length,
      updated: results.filter((item) => !item.created).length,
      rejected: rejected.length,
      perRecordResults: perRecordResults.sort((a, b) => a.index - b.index),
      summary: getProspectRadarSummary(),
    });
  } catch (error) {
    emitEvent('prospect_radar.error', 'opportunity', 'route', { message: error.message }, { source_system: 'agent-os' });
    return Response.json({ error: error.message }, { status: 500 });
  }
}
