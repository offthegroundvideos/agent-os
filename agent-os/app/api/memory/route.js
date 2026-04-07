import { loadMemory, clearMemory, getAllMemorySummary, listWorkspace } from '../../../lib/memory.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get('agentId');
  const action = searchParams.get('action');
  if (action === 'summary') return Response.json(getAllMemorySummary());
  if (action === 'workspace' && agentId) return Response.json(listWorkspace(agentId));
  if (agentId) return Response.json(loadMemory(agentId));
  return Response.json({ error: 'Missing parameters' }, { status: 400 });
}

export async function DELETE(request) {
  const { agentId } = await request.json();
  if (!agentId) return Response.json({ error: 'Missing agentId' }, { status: 400 });
  clearMemory(agentId);
  return Response.json({ success: true, agentId });
}
