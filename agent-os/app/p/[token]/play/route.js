import { osWeb } from '../../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The page's "they pressed play" beacon.
export async function POST(_request, { params }) {
  const { token } = await params;
  osWeb().runtime.sales.recordPlay(token);
  return new Response(null, { status: 204 });
}
