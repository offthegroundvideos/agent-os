import { ESCALATION_RULES, GOVERNANCE_RULES, WINNER_THRESHOLD, canApprovePublish, evaluateWinner } from '../../../lib/governance.js';

export async function GET() {
  return Response.json({ winnerThreshold: WINNER_THRESHOLD, escalationRules: ESCALATION_RULES, governanceRules: GOVERNANCE_RULES });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'evaluateWinner') return Response.json(evaluateWinner(body.performance || {}));
    if (body.action === 'canPublish') return Response.json({ allowed: canApprovePublish(body.role || '') });
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
