import {
  createBookingResearchRun,
  getBookingResearchRun,
  launchBookingResearchRun,
  listBookingResearchRuns,
  updateBookingResearchRun,
} from '../../../lib/bookingResearch.js';

function getConfiguredSecret() {
  return String(process.env.BOOKING_WEBHOOK_SECRET || '').trim();
}

function isAuthorized(request) {
  const configuredSecret = getConfiguredSecret();
  if (!configuredSecret) return true;
  const headerSecret = String(request.headers.get('x-booking-secret') || '').trim();
  return headerSecret && headerSecret === configuredSecret;
}

function normalizeBookingPayload(body = {}) {
  return {
    source: body.source || 'website',
    bookedAt: body.bookedAt || body.booked_at || new Date().toISOString(),
    name: body.name || body.fullName || body.full_name || '',
    companyName: body.companyName || body.company_name || body.businessName || body.business_name || '',
    email: body.email || '',
    phone: body.phone || '',
    website: body.website || body.site || 'https://www.otgicon.com',
    niche: body.niche || body.industry || '',
    targetAudience: body.targetAudience || body.target_audience || '',
    primaryGoal: body.primaryGoal || body.primary_goal || '',
    primaryOffer: body.primaryOffer || body.primary_offer || '',
    location: body.location || body.city || '',
    notes: body.notes || body.message || '',
    pipelineType: body.pipelineType || body.pipeline_type || 'full',
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = String(searchParams.get('id') || '').trim();
  if (id) {
    const booking = getBookingResearchRun(id);
    return Response.json(booking || { error: 'Booking research run not found' }, { status: booking ? 200 : 404 });
  }

  return Response.json({
    success: true,
    bookings: listBookingResearchRuns(),
  });
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = String(body.action || 'create').trim().toLowerCase();

    if (action === 'create') {
      const payload = normalizeBookingPayload(body);
      if (!String(payload.niche || '').trim()) {
        return Response.json({ error: 'Niche is required' }, { status: 400 });
      }
      if (!String(payload.name || payload.companyName || '').trim()) {
        return Response.json({ error: 'Name or companyName is required' }, { status: 400 });
      }

      const { booking, client } = createBookingResearchRun(payload);
      Promise.resolve()
        .then(() => launchBookingResearchRun(booking))
        .catch((error) => {
          updateBookingResearchRun(booking.id, {
            status: 'failed',
            error: error.message || 'Research pipeline launch failed.',
          });
        });

      return Response.json({
        success: true,
        booking,
        client,
      });
    }

    if (action === 'retry') {
      const bookingId = String(body.bookingId || body.id || '').trim();
      const booking = getBookingResearchRun(bookingId);
      if (!booking) {
        return Response.json({ error: 'Booking research run not found' }, { status: 404 });
      }

      const nextBooking = updateBookingResearchRun(booking.id, {
        status: 'queued',
        error: '',
      });

      Promise.resolve()
        .then(() => launchBookingResearchRun(nextBooking))
        .catch((error) => {
          updateBookingResearchRun(booking.id, {
            status: 'failed',
            error: error.message || 'Research pipeline retry failed.',
          });
        });

      return Response.json({
        success: true,
        booking: nextBooking,
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
