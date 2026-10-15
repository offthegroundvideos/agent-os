import { errorResponse, jsonResponse, osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The weekly money report: the last 7 days against the 7 before.
export async function GET() {
  try {
    return jsonResponse(osWeb().runtime.weekly.build());
  } catch (error) {
    return errorResponse(error);
  }
}
