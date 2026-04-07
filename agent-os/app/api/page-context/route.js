import { buildPageContext, buildGhlPageBrief } from '../../../lib/pageContext.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId') || '';
    const context = buildPageContext(assetId);
    if (!context) {
      return Response.json({ error: 'No pipeline page context found yet.' }, { status: 404 });
    }
    return Response.json({
      pageContext: context,
      ghlPageBrief: buildGhlPageBrief(context),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
