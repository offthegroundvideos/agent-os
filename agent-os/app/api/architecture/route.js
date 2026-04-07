import { ARCHITECTURE_SPEC, buildArchitectureTargetContext } from '../../../lib/architectureSpec.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const agentId = searchParams.get('agentId') || '';

  if (format === 'context') {
    return Response.json({ context: buildArchitectureTargetContext(agentId) });
  }

  return Response.json(ARCHITECTURE_SPEC);
}
