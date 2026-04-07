import { listEvents } from '../../../lib/eventLog.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return Response.json(listEvents({
    entityType: searchParams.get('entityType') || '',
    entityId: searchParams.get('entityId') || '',
    eventName: searchParams.get('eventName') || '',
  }));
}
