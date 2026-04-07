import fs from 'fs';
import path from 'path';
import { createCanonicalId } from './canonicalDataModel.js';

const EVENT_FILE = path.join(process.cwd(), 'data', 'events.json');

function ensureFile() {
  const dir = path.dirname(EVENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(EVENT_FILE)) {
    fs.writeFileSync(EVENT_FILE, JSON.stringify({ events: [], lastUpdated: null }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(EVENT_FILE, 'utf-8'));
  } catch {
    return { events: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(EVENT_FILE, JSON.stringify(data, null, 2));
}

export function emitEvent(eventName, entityType, entityId, payload = {}, options = {}) {
  const data = loadData();
  const event = {
    event_id: createCanonicalId('event_log'),
    event_name: eventName,
    entity_type: entityType,
    entity_id: entityId,
    occurred_at: options.occurred_at || new Date().toISOString(),
    source_system: options.source_system || 'agent-os',
    idempotency_key: options.idempotency_key || `${eventName}:${entityId}:${Date.now()}`,
    payload,
  };
  data.events.unshift(event);
  if (data.events.length > 5000) data.events = data.events.slice(0, 5000);
  saveData(data);
  return event;
}

export function listEvents(filters = {}) {
  const data = loadData();
  let events = data.events;
  if (filters.entityType) events = events.filter((event) => event.entity_type === filters.entityType);
  if (filters.entityId) events = events.filter((event) => event.entity_id === filters.entityId);
  if (filters.eventName) events = events.filter((event) => event.event_name === filters.eventName);
  return events;
}
