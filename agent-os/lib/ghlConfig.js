import fs from 'fs';
import path from 'path';
import { addClientRecord, getActiveClientRecord, loadClients, updateClientRecord } from './clientStore.js';

const GHL_AGENCY_FILE = path.join(process.cwd(), 'data', 'ghl-agency.json');

const DEFAULT_AGENCY_CONFIG = {
  agencyName: '',
  agencyApiKey: '',
  companyId: '',
  source: 'env_or_manual',
  lastValidatedAt: null,
  updatedAt: null,
};

export function loadAgencyConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(GHL_AGENCY_FILE, 'utf-8'));
    return { ...DEFAULT_AGENCY_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_AGENCY_CONFIG };
  }
}

export function saveAgencyConfig(nextConfig = {}) {
  const merged = {
    ...loadAgencyConfig(),
    ...nextConfig,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(GHL_AGENCY_FILE), { recursive: true });
  fs.writeFileSync(GHL_AGENCY_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

export function getAgencyCredentials() {
  const config = loadAgencyConfig();
  const apiKey = config.agencyApiKey || process.env.GHL_AGENCY_API_KEY || process.env.GHL_API_KEY || '';
  const companyId = config.companyId || process.env.GHL_COMPANY_ID || '';

  return {
    apiKey,
    companyId,
    agencyName: config.agencyName || process.env.GHL_AGENCY_NAME || 'Agency',
    configured: Boolean(apiKey),
    config,
  };
}

export function getClientCredentials(clientId = null) {
  const client = getActiveClientRecord(clientId);
  const agency = getAgencyCredentials();

  if (client) {
    return {
      apiKey: client.apiKey || agency.apiKey || process.env.GHL_API_KEY || '',
      locationId: client.ghl_location_id || client.locationId || process.env.GHL_LOCATION_ID || '',
      clientName: client.name,
      client,
      agency,
    };
  }

  return {
    apiKey: process.env.GHL_API_KEY || agency.apiKey || '',
    locationId: process.env.GHL_LOCATION_ID || '',
    clientName: 'Default',
    client: null,
    agency,
  };
}

export function getAgencyStatus() {
  const agency = getAgencyCredentials();
  const clients = loadClients();
  return {
    agencyName: agency.agencyName,
    configured: Boolean(agency.apiKey),
    hasApiKey: Boolean(agency.apiKey),
    hasCompanyId: Boolean(agency.companyId),
    companyId: agency.companyId,
    connectedClientCount: clients.clients.length,
    activeClientId: clients.activeClientId || null,
    usingEnvFallback: !loadAgencyConfig().agencyApiKey && Boolean(process.env.GHL_API_KEY),
    lastValidatedAt: loadAgencyConfig().lastValidatedAt || null,
    updatedAt: loadAgencyConfig().updatedAt || null,
  };
}

export function attachProvisionedClient({
  name,
  niche = '',
  color = '#f59e0b',
  email = '',
  phone = '',
  notes = '',
  locationId = '',
  apiKey = '',
}) {
  if (!locationId) return null;

  const clients = loadClients();
  const match = clients.clients.find(entry => entry.ghl_location_id === locationId);
  if (match) {
    return updateClientRecord(match.id, {
      name,
      niche,
      color,
      email,
      phone,
      notes,
      apiKey,
      ghl_location_id: locationId,
    }).client;
  }

  return addClientRecord({
    name,
    niche,
    color,
    email,
    phone,
    notes,
    apiKey,
    ghl_location_id: locationId,
  }).client;
}
