import fs from 'fs';
import path from 'path';
import { addClientRecord, updateClientRecord, loadClients, setActiveClientRecord } from './clientStore.js';
import { emitEvent } from './eventLog.js';
import { queueWorkingMemoryRefresh } from './workingMemory.js';

const BOOKINGS_FILE = path.join(process.cwd(), 'data', 'bookings.json');
const INTERNAL_BASE_URL = process.env.AGENT_OS_INTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:4000';

function ensureBookingsFile() {
  const dir = path.dirname(BOOKINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [], lastUpdated: null }, null, 2));
  }
}

function loadBookings() {
  ensureBookingsFile();
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
  } catch {
    return { bookings: [], lastUpdated: null };
  }
}

function saveBookings(data) {
  ensureBookingsFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
  queueWorkingMemoryRefresh('booking-research-updated');
}

function createBookingId() {
  return `booking_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value, fallback = '') {
  return String(value || fallback).trim();
}

function buildResearchTopic(booking = {}, client = {}) {
  const parts = [
    booking.companyName || client.business_name || client.name,
    booking.niche || client.niche,
    booking.primaryGoal ? `Primary goal: ${booking.primaryGoal}` : '',
    booking.targetAudience ? `Target audience: ${booking.targetAudience}` : '',
    booking.website ? `Website: ${booking.website}` : '',
    booking.notes ? `Notes: ${booking.notes}` : '',
  ].filter(Boolean);
  return parts.join(' | ') || 'New booked call client research';
}

function upsertClientFromBooking(booking = {}) {
  const clients = loadClients().clients || [];
  const email = normalizeString(booking.email).toLowerCase();
  const companyName = normalizeString(booking.companyName || booking.name);
  const existing = clients.find((client) =>
    (email && String(client.email || '').trim().toLowerCase() === email) ||
    (companyName && String(client.business_name || client.name || '').trim().toLowerCase() === companyName.toLowerCase())
  );

  const patch = {
    name: companyName || normalizeString(booking.name, 'Booked Client'),
    business_name: companyName || normalizeString(booking.name, 'Booked Client'),
    email: normalizeString(booking.email),
    phone: normalizeString(booking.phone),
    niche: normalizeString(booking.niche),
    website: normalizeString(booking.website),
    target_audience: normalizeString(booking.targetAudience),
    primary_offer: normalizeString(booking.primaryOffer),
    service_area: normalizeString(booking.location),
    notes: normalizeString(booking.notes),
    onboarding_status: 'booked_call',
    source_system: 'website_booking',
    booking_source: normalizeString(booking.source, 'website'),
    booking_date: normalizeString(booking.bookedAt, new Date().toISOString()),
  };

  if (existing) {
    const updated = updateClientRecord(existing.id, patch).client;
    return updated;
  }

  const created = addClientRecord({
    ...patch,
    status: 'active',
    primary_channels: ['website', 'booked-call'],
    color: '#22d3ee',
  }).client;
  return created;
}

export function listBookingResearchRuns() {
  return (loadBookings().bookings || []).slice().reverse();
}

export function getBookingResearchRun(id) {
  return (loadBookings().bookings || []).find((booking) => booking.id === id) || null;
}

export function createBookingResearchRun(input = {}) {
  const client = upsertClientFromBooking(input);
  setActiveClientRecord(client.id);

  const booking = {
    id: createBookingId(),
    status: 'queued',
    source: normalizeString(input.source, 'website'),
    bookedAt: normalizeString(input.bookedAt, new Date().toISOString()),
    name: normalizeString(input.name),
    companyName: normalizeString(input.companyName || input.name),
    email: normalizeString(input.email),
    phone: normalizeString(input.phone),
    website: normalizeString(input.website),
    niche: normalizeString(input.niche),
    targetAudience: normalizeString(input.targetAudience),
    primaryGoal: normalizeString(input.primaryGoal),
    primaryOffer: normalizeString(input.primaryOffer),
    location: normalizeString(input.location),
    notes: normalizeString(input.notes),
    clientId: client.id,
    pipelineType: normalizeString(input.pipelineType, 'full'),
    researchTopic: buildResearchTopic(input, client),
    processId: '',
    assetId: '',
    reportFilename: '',
    reportPath: '',
    resultSummary: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: '',
  };

  const data = loadBookings();
  data.bookings.unshift(booking);
  saveBookings(data);

  emitEvent(
    'booking.received',
    'booking',
    booking.id,
    { clientId: booking.clientId, niche: booking.niche, companyName: booking.companyName },
    { source_system: 'website_booking' }
  );

  return { booking, client };
}

export function updateBookingResearchRun(id, patch = {}) {
  const data = loadBookings();
  let updated = null;
  data.bookings = (data.bookings || []).map((booking) => {
    if (booking.id !== id) return booking;
    updated = {
      ...booking,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  saveBookings(data);
  return updated;
}

export async function launchBookingResearchRun(booking = {}) {
  const payload = {
    topic: booking.researchTopic,
    pipelineType: booking.pipelineType || 'full',
  };

  const response = await fetch(`${INTERNAL_BASE_URL.replace(/\/$/, '')}/api/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Pipeline request failed with ${response.status}`);
  }

  updateBookingResearchRun(booking.id, { status: 'running' });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed.startsWith('data:')) continue;
      const rawJson = trimmed.slice(5).trim();
      try {
        const event = JSON.parse(rawJson);
        if (event.type === 'start') {
          updateBookingResearchRun(booking.id, {
            status: 'running',
            processId: event.processId || booking.processId || '',
            assetId: event.assetId || booking.assetId || '',
          });
        }
        if (event.type === 'complete') {
          const reportPath = path.join(process.cwd(), 'data', 'workspace', 'alex', event.reportFilename || '');
          updateBookingResearchRun(booking.id, {
            status: 'completed',
            processId: event.processId || booking.processId || '',
            assetId: event.assetId || booking.assetId || '',
            reportFilename: event.reportFilename || '',
            reportPath,
            resultSummary: `Completed full ${booking.pipelineType} research pipeline for ${booking.companyName || booking.name || booking.niche}.`,
          });
          updateClientRecord(booking.clientId, {
            research_packet_id: event.assetId || '',
            research_summary: `Pipeline report ready: ${event.reportFilename || 'report generated'}`,
            onboarding_status: 'research_attached',
          });
          emitEvent(
            'booking.research_completed',
            'booking',
            booking.id,
            { clientId: booking.clientId, assetId: event.assetId || '', reportFilename: event.reportFilename || '' },
            { source_system: 'website_booking' }
          );
        }
        if (event.type === 'error') {
          updateBookingResearchRun(booking.id, {
            status: 'failed',
            error: event.error || 'Pipeline failed.',
          });
        }
      } catch {}
    }
  }
}
