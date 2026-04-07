import { QA_RUBRICS, REWORK_REASONS, recordQaReview } from '../../../lib/qa.js';

export async function GET() {
  return Response.json({ rubrics: QA_RUBRICS, reworkReasons: REWORK_REASONS });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'review') {
      return Response.json({ success: true, review: recordQaReview(body) });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
