import fs from 'fs';
import path from 'path';
import { createCanonicalId, withSystemFields } from './canonicalDataModel.js';
import { queueWorkingMemoryRefresh } from './workingMemory.js';

export const CLIENTS_FILE = path.join(process.cwd(), 'data', 'clients', 'clients.json');

export function loadClients() {
  try {
    return JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'));
  } catch {
    return { clients: [], activeClientId: null };
  }
}

export function saveClients(data) {
  const dir = path.dirname(CLIENTS_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLIENTS_FILE, JSON.stringify(data, null, 2));
  queueWorkingMemoryRefresh('clients-updated');
}

export function normalizeClient(input = {}) {
  const systemFields = withSystemFields(input, {
    created_by: input.created_by || 'human',
    source_system: input.source_system || 'agent-os',
  });
  const resolvedContextType = String(
    input.context_type || input.contextType || (input.status === 'prospect' ? 'prospect' : 'client'),
  ).trim().toLowerCase() === 'prospect'
    ? 'prospect'
    : 'client';

  return {
    id: input.id || createCanonicalId('client'),
    name: String(input.name || '').trim(),
    status: String(input.status || 'active').trim(),
    timezone: String(input.timezone || 'America/Los_Angeles').trim(),
    primary_channels: Array.isArray(input.primary_channels)
      ? input.primary_channels
      : String(input.primary_channels || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
    ghl_location_id: String(input.ghl_location_id || input.locationId || '').trim(),
    default_calendar_id: String(input.default_calendar_id || '').trim(),
    niche: String(input.niche || '').trim(),
    business_name: String(input.business_name || input.businessName || input.name || '').trim(),
    website: String(input.website || '').trim(),
    address: String(input.address || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim(),
    postalCode: String(input.postalCode || input.postal_code || '').trim(),
    country: String(input.country || 'US').trim(),
    context_type: resolvedContextType,
    service_area: String(input.service_area || '').trim(),
    target_audience: String(input.target_audience || '').trim(),
    primary_offer: String(input.primary_offer || '').trim(),
    core_cta: String(input.core_cta || '').trim(),
    brand_positioning: String(input.brand_positioning || '').trim(),
    research_packet_id: String(input.research_packet_id || '').trim(),
    research_summary: input.research_summary || '',
    onboarding_packet: input.onboarding_packet && typeof input.onboarding_packet === 'object'
      ? input.onboarding_packet
      : {},
    onboarding_status: input.onboarding_status || 'draft',
    ghl_onboarding_payload: input.ghl_onboarding_payload && typeof input.ghl_onboarding_payload === 'object'
      ? input.ghl_onboarding_payload
      : {},
    ghl_onboarding_sync_status: input.ghl_onboarding_sync_status || 'not_synced',
    ghl_last_onboarding_sync_at: input.ghl_last_onboarding_sync_at || null,
    ghl_last_onboarding_sync_error: input.ghl_last_onboarding_sync_error || '',
    ghl_owner_contact_id: String(input.ghl_owner_contact_id || '').trim(),
    ghl_last_onboarding_note_id: String(input.ghl_last_onboarding_note_id || '').trim(),
    ghl_custom_field_sync_status: input.ghl_custom_field_sync_status || 'not_synced',
    ghl_custom_field_sync_summary: input.ghl_custom_field_sync_summary && typeof input.ghl_custom_field_sync_summary === 'object'
      ? input.ghl_custom_field_sync_summary
      : {},
    managed_site_url: String(input.managed_site_url || '').trim(),
    landing_page_url: String(input.landing_page_url || '').trim(),
    managed_site_status: input.managed_site_status || 'not_started',
    website_management: input.website_management && typeof input.website_management === 'object'
      ? input.website_management
      : {},
    funnel_tracking_status: input.funnel_tracking_status || 'not_started',
    crm_setup_status: input.crm_setup_status || 'not_started',
    crm_defaults: input.crm_defaults && typeof input.crm_defaults === 'object'
      ? input.crm_defaults
      : {},
    apiKey: input.apiKey || '',
    email: input.email || '',
    phone: input.phone || '',
    notes: input.notes || '',
    color: input.color || '#f59e0b',
    ops_mode: input.ops_mode || 'subaccount',
    ...systemFields,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function getActiveClientRecord(clientId = null) {
  const data = loadClients();
  const resolvedId = clientId || data.activeClientId;
  return data.clients.find(client => client.id === resolvedId) || null;
}

export function addClientRecord(client = {}) {
  const data = loadClients();
  const newClient = normalizeClient(client);
  data.clients.push(newClient);
  if (!data.activeClientId) data.activeClientId = newClient.id;
  saveClients(data);
  return { data, client: newClient };
}

export function updateClientRecord(clientId, patch = {}) {
  const data = loadClients();
  let updatedClient = null;

  data.clients = data.clients.map(client => {
    if (client.id !== clientId) return client;
    updatedClient = normalizeClient({
      ...client,
      ...patch,
      id: client.id,
      createdAt: client.createdAt,
      created_at: client.created_at,
      created_by: client.created_by,
      source_system: client.source_system,
      version: Number(client.version || 1) + 1,
    });
    return updatedClient;
  });

  saveClients(data);
  return { data, client: updatedClient };
}

export function removeClientRecord(clientId) {
  const data = loadClients();
  data.clients = data.clients.filter(client => client.id !== clientId);
  if (data.activeClientId === clientId) {
    data.activeClientId = data.clients[0]?.id || null;
  }
  saveClients(data);
  return data;
}

export function setActiveClientRecord(clientId) {
  const data = loadClients();
  const exists = data.clients.find(client => client.id === clientId);
  if (!exists) return null;
  data.activeClientId = clientId;
  saveClients(data);
  return { data, client: exists };
}

export function clearActiveClientRecord() {
  const data = loadClients();
  data.activeClientId = null;
  saveClients(data);
  return data;
}
