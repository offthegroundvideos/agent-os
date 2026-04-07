import { emitEvent } from '../../../lib/eventLog.js';
import {
  addClientRecord,
  getActiveClientRecord,
  loadClients,
  removeClientRecord,
  setActiveClientRecord,
  updateClientRecord,
} from '../../../lib/clientStore.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const data = loadClients();

  if (action === 'active') {
    const active = getActiveClientRecord();
    return Response.json({ active: active || null, clients: data.clients });
  }

  return Response.json(data);
}

export async function POST(request) {
  const { action, client, clientId } = await request.json();

  if (action === 'add') {
    const { client: newClient } = addClientRecord(client || {});
    emitEvent('client.updated', 'client', newClient.id, { status: newClient.status, name: newClient.name }, { source_system: 'client_intelligence' });
    return Response.json({ success: true, client: newClient });
  }

  if (action === 'setActive') {
    const result = setActiveClientRecord(clientId);
    if (!result) return Response.json({ error: 'Client not found' }, { status: 404 });
    return Response.json({ success: true, activeClientId: clientId });
  }

  if (action === 'remove') {
    removeClientRecord(clientId);
    return Response.json({ success: true });
  }

  if (action === 'update') {
    const result = updateClientRecord(clientId, client || {});
    emitEvent('client.updated', 'client', clientId, { updates: client || {} }, { source_system: 'client_intelligence' });
    return Response.json({ success: true, client: result.client });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}
