import {
  addAttributionTouch,
  addLead,
  addOpportunity,
  updateLead,
  updateOpportunity,
} from '../../../lib/funnelRecords.js';
import { addClientRecord } from '../../../lib/clientStore.js';
import { getActiveClientRecord, updateClientRecord } from '../../../lib/clientStore.js';
import { emitEvent } from '../../../lib/eventLog.js';
import {
  attachProvisionedClient,
  getAgencyCredentials,
  getAgencyStatus,
  getClientCredentials,
  saveAgencyConfig,
} from '../../../lib/ghlConfig.js';
import { buildClientOnboardingPacket, buildGhlPageBrief, buildPageContext } from '../../../lib/pageContext.js';

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

function getResolvedCredentials(clientId = null, scope = 'client') {
  if (scope === 'agency') {
    return getAgencyCredentials();
  }
  return getClientCredentials(clientId);
}

async function ghlRequest(endpoint, method = 'GET', body = null, { clientId = null, scope = 'client', includeLocation = true } = {}) {
  const creds = getResolvedCredentials(clientId, scope);
  const options = {
    method,
    headers: {
      Authorization: 'Bearer ' + creds.apiKey,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    },
  };

  if (!creds.apiKey) {
    throw new Error(scope === 'agency' ? 'Missing GHL agency API key' : 'Missing GHL client API key');
  }

  if (body) {
    const payload = includeLocation && creds.locationId
      ? { ...body, locationId: body.locationId || creds.locationId }
      : body;
    options.body = JSON.stringify(payload);
  }

  const res = await fetch(GHL_BASE + endpoint, options);
  if (!res.ok) {
    const err = await res.text();
    throw new Error('GHL API error ' + res.status + ': ' + err);
  }
  return res.json();
}

function buildProvisionPayload(data = {}, companyId = '') {
  return {
    companyId,
    name: data.name || '',
    businessName: data.businessName || data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    website: data.website || '',
    address: data.address || '',
    city: data.city || '',
    state: data.state || '',
    country: data.country || 'US',
    postalCode: data.postalCode || '',
    timezone: data.timezone || 'America/Los_Angeles',
  };
}

function extractProvisionedLocationId(payload = {}) {
  return (
    payload.location?.id ||
    payload.locationId ||
    payload.id ||
    payload._id ||
    ''
  );
}

function buildReadinessChecklist({ agencyStatus, client, pageContext, ghlPageBrief }) {
  const checks = [
    {
      id: 'agency',
      label: 'Agency provisioning layer connected',
      complete: Boolean(agencyStatus?.hasApiKey && agencyStatus?.hasCompanyId),
    },
    {
      id: 'subaccount',
      label: 'Client sub-account attached',
      complete: Boolean(client?.ghl_location_id || client?.locationId),
    },
    {
      id: 'research',
      label: 'Research packet attached to client',
      complete: Boolean(client?.research_packet_id),
    },
    {
      id: 'offer',
      label: 'Primary offer and CTA captured',
      complete: Boolean(client?.primary_offer && client?.core_cta),
    },
    {
      id: 'page',
      label: 'Page context and GHL page brief ready',
      complete: Boolean(pageContext?.assetId && ghlPageBrief?.title),
    },
    {
      id: 'website',
      label: 'Managed website URL captured',
      complete: Boolean(client?.website),
    },
    {
      id: 'sync',
      label: 'GHL onboarding synced into client CRM',
      complete: client?.ghl_onboarding_sync_status === 'synced',
    },
    {
      id: 'customFields',
      label: 'Structured CRM custom fields mapped',
      complete: ['synced', 'partial'].includes(client?.ghl_custom_field_sync_status),
    },
    {
      id: 'crm',
      label: 'CRM defaults staged for setup',
      complete: ['staged', 'ready'].includes(client?.crm_setup_status),
    },
    {
      id: 'site',
      label: 'Managed website plan staged',
      complete: ['planned', 'ready_to_build', 'live'].includes(client?.managed_site_status),
    },
    {
      id: 'tracking',
      label: 'Funnel tracking plan staged',
      complete: ['staged', 'ready', 'live'].includes(client?.funnel_tracking_status),
    },
  ];

  const completed = checks.filter((item) => item.complete).length;
  return {
    score: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    checks,
  };
}

function buildGhlOnboardingPayload(client, pageContext, ghlPageBrief) {
  return {
    clientId: client?.id || '',
    clientName: client?.name || '',
    locationId: client?.ghl_location_id || client?.locationId || '',
    businessName: client?.business_name || client?.name || '',
    niche: client?.niche || pageContext?.niche || '',
    website: client?.website || '',
    targetAudience: client?.target_audience || pageContext?.audience || '',
    primaryOffer: client?.primary_offer || pageContext?.offerName || '',
    coreCta: client?.core_cta || pageContext?.ctaId || '',
    brandPositioning: client?.brand_positioning || pageContext?.subheadline || '',
    researchPacketId: client?.research_packet_id || pageContext?.assetId || '',
    campaignId: pageContext?.campaignId || '',
    pageBrief: ghlPageBrief || null,
    onboardingSummary: client?.research_summary || pageContext?.strategyNotes || '',
    stagedAt: new Date().toISOString(),
  };
}

function buildGhlOnboardingNote(payload = {}) {
  const lines = [
    'Agent OS Client Onboarding Summary',
    '',
    payload.clientName ? `Client: ${payload.clientName}` : '',
    payload.businessName ? `Business: ${payload.businessName}` : '',
    payload.locationId ? `GHL Location: ${payload.locationId}` : '',
    payload.niche ? `Niche: ${payload.niche}` : '',
    payload.website ? `Website: ${payload.website}` : '',
    payload.targetAudience ? `Target Audience: ${payload.targetAudience}` : '',
    payload.primaryOffer ? `Primary Offer: ${payload.primaryOffer}` : '',
    payload.coreCta ? `Core CTA: ${payload.coreCta}` : '',
    payload.researchPacketId ? `Research Packet: ${payload.researchPacketId}` : '',
    payload.campaignId ? `Campaign: ${payload.campaignId}` : '',
    payload.brandPositioning ? `Brand Positioning: ${payload.brandPositioning}` : '',
    '',
    payload.pageBrief?.title ? `Landing Page Headline: ${payload.pageBrief.title}` : '',
    payload.pageBrief?.subheadline ? `Landing Page Subheadline: ${payload.pageBrief.subheadline}` : '',
    Array.isArray(payload.pageBrief?.benefitBullets) && payload.pageBrief.benefitBullets.length
      ? `Benefits:\n- ${payload.pageBrief.benefitBullets.join('\n- ')}`
      : '',
    Array.isArray(payload.pageBrief?.processBullets) && payload.pageBrief.processBullets.length
      ? `Process:\n- ${payload.pageBrief.processBullets.join('\n- ')}`
      : '',
    payload.onboardingSummary ? `\nStrategy Notes:\n${payload.onboardingSummary}` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

function getCustomFieldCollection(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.customFields)) return payload.customFields;
  if (Array.isArray(payload?.fields)) return payload.fields;
  if (Array.isArray(payload?.data?.customFields)) return payload.data.customFields;
  if (Array.isArray(payload?.data?.fields)) return payload.data.fields;
  return [];
}

function normalizeName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function buildDesiredCustomFieldValues(client = {}, payload = {}) {
  return {
    'Agent OS Research Packet ID': payload.researchPacketId || client.research_packet_id || '',
    'Agent OS Primary Offer': payload.primaryOffer || client.primary_offer || '',
    'Agent OS Core CTA': payload.coreCta || client.core_cta || '',
    'Agent OS Target Audience': payload.targetAudience || client.target_audience || '',
    'Agent OS Brand Positioning': payload.brandPositioning || client.brand_positioning || '',
    'Agent OS Managed Site URL': client.managed_site_url || client.website || '',
    'Agent OS Landing Page URL': client.landing_page_url || '',
    'Agent OS Funnel Tracking Status': client.funnel_tracking_status || '',
  };
}

async function syncMappedCustomFieldsToContact({ clientId, contactId, client, payload }) {
  const locationId = client?.ghl_location_id || client?.locationId || '';
  if (!locationId) {
    return {
      status: 'skipped',
      matchedCount: 0,
      missingFields: Object.keys(buildDesiredCustomFieldValues(client, payload)),
      appliedFields: [],
      reason: 'Missing location ID',
    };
  }

  const fieldPayload = await ghlRequest(`/locations/${locationId}/customFields`, 'GET', null, {
    clientId,
    includeLocation: false,
  });
  const existingFields = getCustomFieldCollection(fieldPayload);
  const desiredValues = buildDesiredCustomFieldValues(client, payload);
  const matchedFields = [];
  const missingFields = [];

  for (const [label, value] of Object.entries(desiredValues)) {
    if (!String(value || '').trim()) continue;
    const match = existingFields.find((field) => {
      const fieldName = String(field?.name || field?.fieldName || field?.label || '').trim().toLowerCase();
      return fieldName === label.toLowerCase();
    });
    if (match?.id) {
      matchedFields.push({ id: match.id, value });
    } else {
      missingFields.push(label);
    }
  }

  if (matchedFields.length > 0) {
    await ghlRequest(`/contacts/${contactId}`, 'PUT', { customFields: matchedFields }, {
      clientId,
      includeLocation: false,
    });
  }

  return {
    status: matchedFields.length > 0 ? (missingFields.length ? 'partial' : 'synced') : 'missing_fields',
    matchedCount: matchedFields.length,
    missingFields,
    appliedFields: matchedFields.map((field) => field.id),
  };
}

function buildWebsiteManagementPayload(client, pageContext, ghlPageBrief) {
  return {
    owner: 'agent-os',
    managedBy: 'otg',
    pageContextAssetId: pageContext?.assetId || '',
    landingPageTitle: ghlPageBrief?.title || pageContext?.headline || '',
    landingPageCta: ghlPageBrief?.cta || pageContext?.ctaId || '',
    targetPlatforms: Array.isArray(pageContext?.platforms) ? pageContext.platforms : [],
    websiteGoal: client?.primaryGoal || 'Convert content attention into qualified leads',
    recommendedSections: [
      'hero',
      'proof',
      'offer',
      'process',
      'faq',
      'cta',
    ],
    lastPlannedAt: new Date().toISOString(),
  };
}

function buildCrmDefaultsPayload(client, pageContext) {
  const nicheSlug = String(client?.niche || pageContext?.niche || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return {
    tags: ['agent-os', 'otg-managed', nicheSlug].filter(Boolean),
    attributionFields: ['landing_page_id', 'cta_id', 'campaign_id', 'content_asset_id', 'platform'],
    recommendedPipeline: 'main_sales',
    recommendedStages: ['new_lead', 'qualified', 'booked_call', 'proposal_sent', 'won'],
    sourceSystem: 'agent-os',
  };
}

export async function POST(request) {
  try {
    const { action, data, clientId } = await request.json();
    const creds = getClientCredentials(clientId);

    switch (action) {
      case 'saveAgencyConfig': {
        const next = saveAgencyConfig({
          agencyName: data?.agencyName || '',
          agencyApiKey: data?.agencyApiKey || '',
          companyId: data?.companyId || '',
          source: 'manual',
          lastValidatedAt: null,
        });
        return Response.json({ success: true, agency: getAgencyStatus(), config: next });
      }

      case 'validateAgency': {
        if (data?.agencyName || data?.agencyApiKey || data?.companyId) {
          saveAgencyConfig({
            agencyName: data?.agencyName || '',
            agencyApiKey: data?.agencyApiKey || '',
            companyId: data?.companyId || '',
            source: 'manual',
          });
        }

        const agency = getAgencyCredentials();
        if (!agency.apiKey) {
          return Response.json({ success: false, error: 'Missing agency API key' }, { status: 400 });
        }

        const payload = {
          ok: true,
          agencyName: agency.agencyName,
          hasCompanyId: Boolean(agency.companyId),
        };

        // Use a lightweight agency-authenticated read as a token check.
        if (agency.companyId) {
          try {
            const response = await ghlRequest(`/saas/${agency.companyId}/plans`, 'GET', null, { scope: 'agency', includeLocation: false });
            saveAgencyConfig({ lastValidatedAt: new Date().toISOString() });
            return Response.json({ success: true, payload: { ...payload, response } });
          } catch (error) {
            return Response.json({ success: false, error: error.message }, { status: 400 });
          }
        }

        saveAgencyConfig({ lastValidatedAt: new Date().toISOString() });
        return Response.json({ success: true, payload });
      }

      case 'provisionSubAccount': {
        const agency = getAgencyCredentials();
        if (!agency.apiKey || !agency.companyId) {
          return Response.json({ error: 'Agency API key and company ID are required before provisioning sub-accounts.' }, { status: 400 });
        }

        const created = await ghlRequest('/locations/', 'POST', buildProvisionPayload(data, agency.companyId), {
          scope: 'agency',
          includeLocation: false,
        });

        const locationId = extractProvisionedLocationId(created);
        const attachedClient = attachProvisionedClient({
          name: data?.name || created.location?.name || created.name || 'New Client',
          niche: data?.niche || '',
          color: data?.color || '#f59e0b',
          email: data?.email || '',
          phone: data?.phone || '',
          notes: data?.notes || 'Provisioned from agency account',
          locationId,
          apiKey: data?.apiKey || '',
        });

        return Response.json({
          success: true,
          location: created,
          locationId,
          client: attachedClient,
          message: attachedClient
            ? `Provisioned sub-account and attached it to ${attachedClient.name}.`
            : 'Provisioned sub-account.',
        });
      }

      case 'importExistingSubAccount': {
        const client = addClientRecord({
          name: data?.name || '',
          niche: data?.niche || '',
          locationId: data?.locationId || '',
          ghl_location_id: data?.locationId || '',
          apiKey: data?.apiKey || '',
          email: data?.email || '',
          phone: data?.phone || '',
          notes: data?.notes || '',
          color: data?.color || '#f59e0b',
          ops_mode: 'subaccount',
        }).client;
        return Response.json({ success: true, client });
      }

      case 'attachResearchPacket': {
        const targetClient = getActiveClientRecord(clientId);
        if (!targetClient) {
          return Response.json({ error: 'Client not found' }, { status: 404 });
        }

        const pageContext = buildPageContext(data?.assetId || '');
        if (!pageContext) {
          return Response.json({ error: 'No pipeline page context found to attach.' }, { status: 404 });
        }

        const packetClientName = normalizeName(pageContext.clientName);
        const targetClientName = normalizeName(targetClient.name || targetClient.business_name || '');
        if (packetClientName && targetClientName && packetClientName !== targetClientName) {
          return Response.json({
            error: `Pipeline packet client "${pageContext.clientName}" does not match target client "${targetClient.name}".`,
          }, { status: 409 });
        }

        const onboardingPacket = buildClientOnboardingPacket(pageContext);
        const updated = updateClientRecord(targetClient.id, {
          niche: data?.niche || onboardingPacket?.niche || targetClient.niche,
          website: data?.website || targetClient.website || '',
          service_area: data?.service_area || targetClient.service_area || '',
          target_audience: onboardingPacket?.target_audience || targetClient.target_audience || '',
          primary_offer: onboardingPacket?.primary_offer || targetClient.primary_offer || '',
          core_cta: onboardingPacket?.core_cta || targetClient.core_cta || '',
          brand_positioning: onboardingPacket?.brand_positioning || targetClient.brand_positioning || '',
          research_packet_id: onboardingPacket?.research_packet_id || targetClient.research_packet_id || '',
          research_summary: onboardingPacket?.research_summary || targetClient.research_summary || '',
          onboarding_packet: {
            ...(targetClient.onboarding_packet || {}),
            ...(onboardingPacket?.onboarding_packet || {}),
          },
          onboarding_status: 'research_attached',
          ghl_onboarding_sync_status: targetClient.ghl_onboarding_sync_status === 'synced' ? 'synced' : 'staged',
        });

        return Response.json({
          success: true,
          client: updated.client,
          pageContext,
          ghlPageBrief: buildGhlPageBrief(pageContext),
          message: `Attached the latest pipeline packet to ${updated.client?.name || targetClient.name}.`,
        });
      }

      case 'stageOnboardingSync': {
        const targetClient = getActiveClientRecord(clientId);
        if (!targetClient) {
          return Response.json({ error: 'Client not found' }, { status: 404 });
        }

        const assetId = data?.assetId || targetClient.research_packet_id || '';
        const pageContext = buildPageContext(assetId);
        if (!pageContext) {
          return Response.json({ error: 'No pipeline page context found to stage for GHL.' }, { status: 404 });
        }

        const ghlPageBrief = buildGhlPageBrief(pageContext);
        const payload = buildGhlOnboardingPayload(targetClient, pageContext, ghlPageBrief);
        const updated = updateClientRecord(targetClient.id, {
          ghl_onboarding_payload: payload,
          ghl_onboarding_sync_status: 'staged',
          ghl_last_onboarding_sync_at: new Date().toISOString(),
          ghl_last_onboarding_sync_error: '',
        });

        emitEvent(
          'ghl.onboarding.staged',
          'client',
          targetClient.id,
          { locationId: payload.locationId, researchPacketId: payload.researchPacketId },
          { source_system: 'ghl_connector' }
        );

        return Response.json({
          success: true,
          client: updated.client,
          payload,
          message: `Staged the onboarding summary payload for ${updated.client?.name || targetClient.name}.`,
        });
      }

      case 'runFullOnboarding': {
        const targetClient = getActiveClientRecord(clientId);
        if (!targetClient) {
          return Response.json({ error: 'Client not found' }, { status: 404 });
        }

        const assetId = data?.assetId || targetClient.research_packet_id || '';
        const pageContext = buildPageContext(assetId);
        if (!pageContext) {
          return Response.json({ error: 'No pipeline page context found to build onboarding from.' }, { status: 404 });
        }

        const onboardingPacket = buildClientOnboardingPacket(pageContext);
        const ghlPageBrief = buildGhlPageBrief(pageContext);
        const websiteManagement = buildWebsiteManagementPayload(targetClient, pageContext, ghlPageBrief);
        const crmDefaults = buildCrmDefaultsPayload(targetClient, pageContext);
        const ghlPayload = buildGhlOnboardingPayload(targetClient, pageContext, ghlPageBrief);

        const updated = updateClientRecord(targetClient.id, {
          niche: data?.niche || onboardingPacket?.niche || targetClient.niche,
          website: data?.website || targetClient.website || '',
          service_area: data?.service_area || targetClient.service_area || '',
          target_audience: onboardingPacket?.target_audience || targetClient.target_audience || '',
          primary_offer: onboardingPacket?.primary_offer || targetClient.primary_offer || '',
          core_cta: onboardingPacket?.core_cta || targetClient.core_cta || '',
          brand_positioning: onboardingPacket?.brand_positioning || targetClient.brand_positioning || '',
          research_packet_id: onboardingPacket?.research_packet_id || targetClient.research_packet_id || '',
          research_summary: onboardingPacket?.research_summary || targetClient.research_summary || '',
          onboarding_packet: {
            ...(targetClient.onboarding_packet || {}),
            ...(onboardingPacket?.onboarding_packet || {}),
          },
          onboarding_status: 'ready_for_build',
          ghl_onboarding_payload: ghlPayload,
          ghl_onboarding_sync_status: 'staged',
          ghl_last_onboarding_sync_at: new Date().toISOString(),
          ghl_last_onboarding_sync_error: '',
          managed_site_status: 'ready_to_build',
          website_management: {
            ...(targetClient.website_management || {}),
            ...websiteManagement,
          },
          crm_setup_status: 'staged',
          crm_defaults: crmDefaults,
          funnel_tracking_status: 'staged',
        });

        emitEvent(
          'client.onboarding.prepared',
          'client',
          targetClient.id,
          {
            researchPacketId: updated.client?.research_packet_id || '',
            locationId: updated.client?.ghl_location_id || '',
            managedSiteStatus: updated.client?.managed_site_status || '',
          },
          { source_system: 'ghl_connector' }
        );

        return Response.json({
          success: true,
          client: updated.client,
          pageContext,
          ghlPageBrief,
          websiteManagement,
          crmDefaults,
          payload: ghlPayload,
          message: `${updated.client?.name || targetClient.name} now has a full onboarding structure staged for CRM and website management.`,
        });
      }

      case 'syncOnboardingToGhl': {
        const targetClient = getActiveClientRecord(clientId);
        if (!targetClient) {
          return Response.json({ error: 'Client not found' }, { status: 404 });
        }

        const assetId = data?.assetId || targetClient.research_packet_id || '';
        const pageContext = buildPageContext(assetId);
        if (!pageContext) {
          return Response.json({ error: 'No pipeline page context found to sync.' }, { status: 404 });
        }

        const ghlPageBrief = buildGhlPageBrief(pageContext);
        const payload = Object.keys(targetClient.ghl_onboarding_payload || {}).length
          ? targetClient.ghl_onboarding_payload
          : buildGhlOnboardingPayload(targetClient, pageContext, ghlPageBrief);

        let ownerContactId = data?.contactId || targetClient.ghl_owner_contact_id || '';
        let createdContact = null;

        if (!ownerContactId) {
          if (!targetClient.email) {
            return Response.json({ error: 'Client email is required to create or sync an owner contact in GHL.' }, { status: 400 });
          }
          const [firstName, ...rest] = String(targetClient.name || 'Client Owner').trim().split(/\s+/);
          const lastName = rest.join(' ');
          const contact = await ghlRequest('/contacts/', 'POST', {
            firstName: firstName || 'Client',
            lastName: lastName || 'Owner',
            email: targetClient.email || '',
            phone: targetClient.phone || '',
            tags: ['agent-os', 'client-owner', 'onboarding-sync'],
            source: 'Agent OS Onboarding Sync',
          }, { clientId });
          ownerContactId = contact.contact?.id || '';
          createdContact = contact;
        }

        if (!ownerContactId) {
          return Response.json({ error: 'Unable to resolve a GHL contact for onboarding sync.' }, { status: 400 });
        }

        const noteBody = buildGhlOnboardingNote(payload);
        const note = await ghlRequest(`/contacts/${ownerContactId}/notes/`, 'POST', {
          body: noteBody,
        }, { clientId });

        const customFieldSync = await syncMappedCustomFieldsToContact({
          clientId,
          contactId: ownerContactId,
          client: targetClient,
          payload,
        });

        const updated = updateClientRecord(targetClient.id, {
          ghl_onboarding_payload: payload,
          ghl_onboarding_sync_status: 'synced',
          ghl_last_onboarding_sync_at: new Date().toISOString(),
          ghl_last_onboarding_sync_error: '',
          ghl_owner_contact_id: ownerContactId,
          ghl_last_onboarding_note_id: note.note?.id || note.id || '',
          ghl_custom_field_sync_status: customFieldSync.status,
          ghl_custom_field_sync_summary: customFieldSync,
          crm_setup_status: 'ready',
          funnel_tracking_status: targetClient.funnel_tracking_status === 'not_started' ? 'staged' : targetClient.funnel_tracking_status,
        });

        emitEvent(
          'ghl.onboarding.synced',
          'client',
          targetClient.id,
          { ownerContactId, noteId: updated.client?.ghl_last_onboarding_note_id || '' },
          { source_system: 'ghl_connector' }
        );

        return Response.json({
          success: true,
          client: updated.client,
          contact: createdContact,
          note,
          ownerContactId,
          customFieldSync,
          message: `Synced the onboarding summary into ${updated.client?.name || targetClient.name}'s GHL CRM record.`,
        });
      }

      case 'createContact': {
        const contact = await ghlRequest('/contacts/', 'POST', {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          tags: data.tags || ['agent-os'],
          source: 'Agent OS',
        }, { clientId });
        const lead = addLead({
          client_id: clientId || 'cli_default',
          ghl_contact_id: contact.contact?.id || '',
          first_touch_post_id: data.first_touch_post_id || '',
          last_touch_post_id: data.last_touch_post_id || data.first_touch_post_id || '',
          landing_page_id: data.landing_page_id || 'lpg_default',
          cta_id: data.cta_id || 'cta_default',
          cta_keyword: data.cta_keyword || '',
          campaign_id: data.campaign_id || 'cmp_default',
          content_asset_id: data.content_asset_id || '',
          platform: data.platform || 'instagram',
          quality_score: Number(data.quality_score || 0),
          status: data.status || 'new',
          name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
          email: data.email || '',
          phone: data.phone || '',
          qualification_notes: data.qualification_notes || '',
          source_system: 'ghl_connector',
          created_by: 'ghl_connector',
        });
        if (data.landing_page_id || data.cta_id) {
          addAttributionTouch({
            client_id: clientId || 'cli_default',
            campaign_id: data.campaign_id || 'cmp_default',
            content_asset_id: data.content_asset_id || '',
            published_post_id: data.published_post_id || '',
            platform: data.platform || 'instagram',
            cta_id: data.cta_id || 'cta_default',
            cta_keyword: data.cta_keyword || '',
            landing_page_id: data.landing_page_id || 'lpg_default',
            lead_id: lead.id,
            touch_type: data.touch_type || 'form_submitted',
            utm_source: data.utm_source || '',
            utm_medium: data.utm_medium || '',
            utm_campaign: data.utm_campaign || '',
            source_system: 'ghl_connector',
            created_by: 'ghl_connector',
          });
        }
        return Response.json({ success: true, contact, lead, client: creds.clientName });
      }

      case 'createNote': {
        const note = await ghlRequest(`/contacts/${data.contactId}/notes/`, 'POST', {
          body: data.note,
        }, { clientId });
        return Response.json({ success: true, note });
      }

      case 'addTags': {
        const tags = await ghlRequest(`/contacts/${data.contactId}/tags/`, 'POST', {
          tags: data.tags,
        }, { clientId });
        return Response.json({ success: true, tags });
      }

      case 'fullClientSetup': {
        const newContact = await ghlRequest('/contacts/', 'POST', {
          firstName: data.contact.firstName || '',
          lastName: data.contact.lastName || '',
          email: data.contact.email || '',
          phone: data.contact.phone || '',
          tags: ['agent-os', 'new-lead', data.niche ? data.niche.toLowerCase().replace(/\s+/g, '-') : 'general'],
          source: 'Agent OS Mission Control',
        }, { clientId });

        const contactId = newContact.contact.id;

        await ghlRequest(`/contacts/${contactId}/notes/`, 'POST', {
          body: 'Onboarded via Agent OS\n\nNiche: ' + (data.niche || 'Not specified') + '\nContent Plan: ' + (data.contentPlan || 'Pending') + '\nGHL Sub-Account: ' + creds.clientName,
        }, { clientId });

        const leadRecord = addLead({
          client_id: clientId || 'cli_default',
          ghl_contact_id: contactId,
          landing_page_id: data.landing_page_id || 'lpg_default',
          cta_id: data.cta_id || 'cta_default',
          cta_keyword: data.cta_keyword || '',
          campaign_id: data.campaign_id || 'cmp_default',
          content_asset_id: data.content_asset_id || '',
          platform: data.platform || 'instagram',
          status: 'new',
          name: `${data.contact.firstName || ''} ${data.contact.lastName || ''}`.trim(),
          email: data.contact.email || '',
          phone: data.contact.phone || '',
          qualification_notes: data.contentPlan || '',
          source_system: 'ghl_connector',
          created_by: 'ghl_connector',
        });

        return Response.json({
          success: true,
          contactId,
          leadId: leadRecord.id,
          clientName: creds.clientName,
          message: 'Contact created in ' + creds.clientName + ' sub-account',
        });
      }

      case 'createOpportunity': {
        const opportunityRecord = addOpportunity({
          client_id: clientId || 'cli_default',
          ghl_opportunity_id: data.ghlOpportunityId || '',
          lead_id: data.lead_id || 'led_default',
          stage: data.stage || 'booked_call',
          pipeline: data.pipeline || 'main_sales',
          value: Number(data.value || 0),
          status: data.status || 'open',
          appointment_id: data.appointment_id || '',
          source_system: 'ghl_connector',
          created_by: 'ghl_connector',
        });
        return Response.json({ success: true, opportunity: opportunityRecord, client: creds.clientName });
      }

      case 'updateOpportunity':
        return Response.json({
          success: true,
          opportunity: updateOpportunity(data.id || data.opportunityId, {
            stage: data.stage,
            pipeline: data.pipeline,
            value: data.value,
            status: data.status,
            appointment_id: data.appointment_id,
            ghl_opportunity_id: data.ghlOpportunityId || data.ghl_opportunity_id,
            source_system: 'ghl_connector',
          }),
        });

      case 'updateLead':
        return Response.json({
          success: true,
          lead: updateLead(data.id || data.leadId, {
            status: data.status,
            qualified: data.qualified,
            quality_score: data.quality_score,
            qualification_notes: data.qualification_notes,
            ghl_contact_id: data.ghl_contact_id,
            source_system: 'ghl_connector',
          }),
        });

      default:
        return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const clientId = searchParams.get('clientId');
    const creds = getClientCredentials(clientId);

    if (action === 'agencyStatus') {
      return Response.json({ success: true, agency: getAgencyStatus() });
    }

    if (action === 'pipelines') {
      const data = await ghlRequest(`/pipelines/?locationId=${creds.locationId}`, 'GET', null, { clientId, includeLocation: false });
      return Response.json({ ...data, clientName: creds.clientName });
    }

    if (action === 'authMode') {
      return Response.json({
        success: true,
        agency: getAgencyStatus(),
        client: {
          clientName: creds.clientName,
          hasLocationId: Boolean(creds.locationId),
          usingClientApiKey: Boolean(creds.client?.apiKey),
        },
      });
    }

    if (action === 'onboardingStatus') {
      const client = getActiveClientRecord(clientId);
      if (!client) {
        return Response.json({ error: 'Client not found' }, { status: 404 });
      }

      const assetId = searchParams.get('assetId') || client.research_packet_id || '';
      const pageContext = buildPageContext(assetId);
      const ghlPageBrief = pageContext ? buildGhlPageBrief(pageContext) : null;
      const agency = getAgencyStatus();
      const readiness = buildReadinessChecklist({ agencyStatus: agency, client, pageContext, ghlPageBrief });

      return Response.json({
        success: true,
        client,
        agency,
        readiness,
        pageContext,
        ghlPageBrief,
      });
    }

    return Response.json({ error: 'Missing action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
