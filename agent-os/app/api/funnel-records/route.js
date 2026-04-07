import {
  addAttributionTouch,
  buildFunnelDashboard,
  findBestLandingPageMatch,
  addLandingPage,
  addLead,
  addOpportunity,
  listAttributionTouches,
  listLandingPages,
  listLeads,
  listOpportunities,
  updateLead,
  updateOpportunity,
} from '../../../lib/funnelRecords.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entity = searchParams.get('entity') || 'landing_pages';
  const filters = {
    client_id: searchParams.get('client_id') || '',
    campaign_id: searchParams.get('campaign_id') || '',
    landing_page_id: searchParams.get('landing_page_id') || '',
    lead_id: searchParams.get('lead_id') || '',
    cta_id: searchParams.get('cta_id') || '',
  };

  if (entity === 'landing_pages') return Response.json(listLandingPages(filters));
  if (entity === 'leads') return Response.json(listLeads(filters));
  if (entity === 'opportunities') return Response.json(listOpportunities(filters));
  if (entity === 'attribution_touches') return Response.json(listAttributionTouches(filters));
  if (entity === 'dashboard') return Response.json(buildFunnelDashboard(filters));
  if (entity === 'landing_page_match') return Response.json({ landingPage: findBestLandingPageMatch(filters) });

  return Response.json({ error: 'Unknown entity' }, { status: 400 });
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body.action === 'createLandingPage') {
      return Response.json({ success: true, landingPage: addLandingPage(body.data || body) });
    }

    if (body.action === 'createLead') {
      const lead = addLead(body.data || body);
      if (body.touch) {
        addAttributionTouch({
          ...(body.touch || {}),
          lead_id: lead.id,
          landing_page_id: body.touch.landing_page_id || lead.landing_page_id,
          cta_id: body.touch.cta_id || lead.cta_id,
          client_id: body.touch.client_id || lead.client_id,
          campaign_id: body.touch.campaign_id || lead.campaign_id,
          touch_type: body.touch.touch_type || 'form_submitted',
        });
      }
      return Response.json({ success: true, lead });
    }

    if (body.action === 'createOpportunity') {
      return Response.json({ success: true, opportunity: addOpportunity(body.data || body) });
    }

    if (body.action === 'updateLead') {
      return Response.json({ success: true, lead: updateLead(body.id || body.leadId, body.data || body.updates || body) });
    }

    if (body.action === 'updateOpportunity') {
      return Response.json({ success: true, opportunity: updateOpportunity(body.id || body.opportunityId, body.data || body.updates || body) });
    }

    if (body.action === 'createTouch') {
      return Response.json({ success: true, attributionTouch: addAttributionTouch(body.data || body) });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
