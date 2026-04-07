import { generateCalendarEntriesForAsset, listCalendarEntries } from '../../../lib/contentCalendar.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const asset_id = searchParams.get('asset_id') || '';
  const client_id = searchParams.get('client_id') || '';
  return Response.json(listCalendarEntries({ asset_id, client_id, includeProduction: true }));
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'generate') {
      const entries = generateCalendarEntriesForAsset({
        assetId: body.assetId,
        topic: body.topic,
        pipelineType: body.pipelineType,
        completedSteps: body.completedSteps || [],
      });
      return Response.json({ success: true, entries });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
