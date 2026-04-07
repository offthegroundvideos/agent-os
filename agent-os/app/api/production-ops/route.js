import { listCalendarEntries } from '../../../lib/contentCalendar.js';
import { ensureProductionBundleForCalendarEntry, getProductionBundleForCalendarEntry, listProductionBundles, updateProductionStatus } from '../../../lib/productionOps.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const entryId = searchParams.get('entryId') || '';
    if (entryId) {
      return Response.json(getProductionBundleForCalendarEntry(entryId) || {});
    }

    const clientId = searchParams.get('client_id') || '';
    const entries = listCalendarEntries({ client_id: clientId });
    return Response.json(listProductionBundles(entries.map((entry) => entry.id)));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action !== 'generate') {
      if (body.action === 'update-status') {
        if (!body.entryId) {
          return Response.json({ error: 'entryId is required' }, { status: 400 });
        }
        const bundle = updateProductionStatus(
          body.entryId,
          {
            shootStatus: body.shootStatus,
            editStatus: body.editStatus,
            renderStatus: body.renderStatus,
            notes: body.notes,
          },
          {
            changedBy: body.changedBy || 'human',
            reason: body.reason || 'Manual production update',
          }
        );
        return Response.json({ success: true, bundle });
      }
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }

    const entry = listCalendarEntries({ client_id: body.client_id || '' }).find((item) => item.id === body.entryId);
    if (!entry) {
      return Response.json({ error: 'Calendar entry not found' }, { status: 404 });
    }

    const bundle = ensureProductionBundleForCalendarEntry(entry);
    return Response.json({ success: true, bundle });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
