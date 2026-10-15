import { htmlResponse, renderBooked, renderBooking, renderGone } from '../../../../lib/os/salesPages.js';
import { SalesError } from '../../../../lib/os/sales.js';
import { osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A few booking attempts per page per 10 minutes, so a form spammer can't fill the calendar.
const attempts = new Map();
function allowed(token) {
  const now = Date.now();
  const recent = (attempts.get(token) ?? []).filter((at) => now - at < 600_000);
  recent.push(now);
  attempts.set(token, recent);
  return recent.length <= 6;
}

export async function GET(_request, { params }) {
  const { token } = await params;
  const { sales } = osWeb().runtime;
  const page = sales.publicPage(token);
  if (!page) return htmlResponse(renderGone(), 404);
  return htmlResponse(renderBooking(page, await sales.openSlots()));
}

export async function POST(request, { params }) {
  const { token } = await params;
  const { sales } = osWeb().runtime;
  const page = sales.publicPage(token);
  if (!page) return htmlResponse(renderGone(), 404);
  let form;
  try {
    form = await request.formData();
  } catch {
    form = new FormData();
  }
  const values = { start: String(form.get('start') ?? ''), name: String(form.get('name') ?? ''), email: String(form.get('email') ?? ''), note: String(form.get('note') ?? '') };
  // The hidden "website" field is a trap for bots; people never see it.
  if (String(form.get('website') ?? '').trim()) return htmlResponse(renderBooking(page, await sales.openSlots(), { error: 'Something went wrong. Please try again.' }), 400);
  if (!allowed(token)) return htmlResponse(renderBooking(page, await sales.openSlots(), { error: 'Too many tries. Please wait a few minutes.', values }), 429);
  try {
    const result = await sales.book(token, values);
    return htmlResponse(renderBooked(page, result));
  } catch (error) {
    const message = error instanceof SalesError ? error.message : 'We could not book that time. Please try another, or reply to our email.';
    if (!(error instanceof SalesError)) console.error(`[otg-os web] booking failed: ${error?.message ?? error}`);
    return htmlResponse(renderBooking(page, await sales.openSlots(), { error: message, values }), 400);
  }
}
