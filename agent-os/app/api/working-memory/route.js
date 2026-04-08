import { loadWorkingMemory, refreshWorkingMemory } from '../../../lib/workingMemory.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const refresh = String(searchParams.get('refresh') || '').trim().toLowerCase();
  const snapshot = refresh === '1' || refresh === 'true'
    ? refreshWorkingMemory('api-refresh')
    : loadWorkingMemory();

  return Response.json({
    success: true,
    workingMemory: snapshot,
  });
}
