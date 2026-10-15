import { errorResponse, jsonResponse, osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Who is due a follow-up in the next 7 days.
export async function GET() {
  try {
    return jsonResponse(osWeb().dashboard.followUpQueue(7));
  } catch (error) {
    return errorResponse(error);
  }
}
