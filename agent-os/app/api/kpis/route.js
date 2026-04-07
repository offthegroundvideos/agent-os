import { getKpiDashboard, recordKpiEntry, recordStageTiming } from '../../../lib/kpis.js';

export async function GET() {
  return Response.json(getKpiDashboard());
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'recordMetric') {
      return Response.json({ success: true, entry: recordKpiEntry(body) });
    }
    if (body.action === 'recordStageTiming') {
      return Response.json({ success: true, timing: recordStageTiming(body) });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
