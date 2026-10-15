import { errorResponse, jsonResponse, osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonResponse(osWeb().dashboard.today());
  } catch (error) {
    return errorResponse(error);
  }
}
