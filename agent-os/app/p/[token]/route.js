import { htmlResponse, renderGone, renderLeadPage } from '../../../lib/os/salesPages.js';
import { osWeb } from '../../../lib/os/web.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A prospect's personal page. Public (through Tailscale Funnel); shows only what was made for them.
export async function GET(_request, { params }) {
  const { token } = await params;
  const { sales } = osWeb().runtime;
  const page = sales.publicPage(token);
  if (!page) return htmlResponse(renderGone(), 404);
  sales.recordView(token).catch(() => {});
  return htmlResponse(renderLeadPage(page));
}
