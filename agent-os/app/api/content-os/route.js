import {
  addAntiFluff,
  addClaim,
  addExperiment,
  addLeadFeedback,
  addNegativePattern,
  addObjection,
  addOffer,
  addPostmortem,
  addProductionReality,
  addProof,
  addTopic,
  buildContentOSContext,
  generateSeriesVariants,
  getContentOSSummary,
  getRecommendedTopicQueue,
  loadContentOS,
  scoreTopic,
  updateStrategy,
} from '../../../lib/contentOS.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const task = searchParams.get('task') || '';
  const agentId = searchParams.get('agentId') || '';

  if (action === 'state') return Response.json(loadContentOS());
  if (action === 'context') return Response.json({ context: buildContentOSContext(task, agentId) });
  if (action === 'queue') return Response.json(getRecommendedTopicQueue(Number(searchParams.get('limit') || 12)));
  return Response.json(getContentOSSummary());
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'updateStrategy') {
      return Response.json({ success: true, strategy: updateStrategy(body.strategy || body) });
    }

    if (action === 'addOffer') return Response.json({ success: true, offer: addOffer(body.offer || body) });
    if (action === 'addProof') return Response.json({ success: true, proof: addProof(body.proof || body) });
    if (action === 'addClaim') return Response.json({ success: true, claim: addClaim(body.claim || body) });
    if (action === 'addNegativePattern') return Response.json({ success: true, pattern: addNegativePattern(body.pattern || body) });
    if (action === 'addExperiment') return Response.json({ success: true, experiment: addExperiment(body.experiment || body) });
    if (action === 'addTopic') return Response.json({ success: true, topic: addTopic(body.topic || body) });
    if (action === 'addLeadFeedback') return Response.json({ success: true, lead: addLeadFeedback(body.lead || body) });
    if (action === 'addObjection') return Response.json({ success: true, objection: addObjection(body.objection || body) });
    if (action === 'addProductionReality') return Response.json({ success: true, entry: addProductionReality(body.entry || body) });
    if (action === 'addAntiFluff') return Response.json({ success: true, entry: addAntiFluff(body.entry || body) });
    if (action === 'addPostmortem') return Response.json({ success: true, review: addPostmortem(body.review || body) });
    if (action === 'scoreTopic') return Response.json({ success: true, weightedScore: scoreTopic(body.scores || body) });
    if (action === 'generateSeries') return Response.json({ success: true, variants: generateSeriesVariants(body.title || body.topic || '') });

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
