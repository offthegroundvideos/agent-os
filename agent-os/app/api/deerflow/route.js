import { dispatchDeerFlowTask, getRepoOptions, listDeerFlowJobs } from '../../../lib/deerflowBridge.js';
import { getRoutingPolicySummary } from '../../../lib/routingPolicy.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    jobs: listDeerFlowJobs(),
    routingPolicy: getRoutingPolicySummary(),
    repoOptions: getRepoOptions(),
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.agentId || !body.message) {
      return Response.json({ error: 'Missing agentId or message' }, { status: 400 });
    }
    const result = await dispatchDeerFlowTask({
      agentId: body.agentId,
      message: body.message,
      repoPath: body.repoPath || '',
      validation: body.validation || '',
      mobileMode: body.mobileMode === true,
      operatorNotes: body.operatorNotes || '',
      returnStyle: body.returnStyle || 'standard',
    });
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message, deerflowJob: error.deerflowJob || null }, { status: 500 });
  }
}
