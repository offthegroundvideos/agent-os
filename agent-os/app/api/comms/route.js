import { getSessions, getSession } from '../../../lib/comms.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (sessionId) {
    const session = getSession(sessionId);
    return Response.json(session || { error: 'Session not found' });
  }
  return Response.json(getSessions());
}