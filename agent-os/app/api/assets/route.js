import { createAsset, getAsset, listAssets, recordApproval, setAssetPublishMetadata, transitionAsset, updateAssetOutput } from '../../../lib/assets.js';
import { upsertPublishedPost } from '../../../lib/contentRecords.js';
import { findBestLandingPageMatch } from '../../../lib/funnelRecords.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId');
  if (assetId) {
    const asset = getAsset(assetId);
    return Response.json(asset || { error: 'Asset not found' }, { status: asset ? 200 : 404 });
  }
  return Response.json(listAssets());
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body.action === 'create') return Response.json({ success: true, asset: createAsset(body) });
    if (body.action === 'transition') {
      if (body.nextState === 'published') {
        const resolvedLandingPage = body.landingPageId || body.landing_page_id
          ? { id: body.landingPageId || body.landing_page_id }
          : findBestLandingPageMatch({
            client_id: body.clientId || body.client_id || 'cli_default',
            campaign_id: body.campaignId || body.campaign_id || 'cmp_default',
            cta_id: body.ctaId || body.cta_id || 'cta_default',
            offer_id: body.offerId || body.offer_id || '',
          });
        const publishRecord = upsertPublishedPost({
          content_asset_id: body.assetId,
          client_id: body.clientId || body.client_id || 'cli_default',
          platform: body.platform || 'instagram',
          platform_post_id: body.platformPostId || body.platform_post_id || '',
          post_url: body.postUrl || body.post_url || '',
          cta_id: body.ctaId || body.cta_id || 'cta_default',
          landing_page_id: resolvedLandingPage?.id || 'lpg_default',
          published_at: body.publishedAt || body.published_at,
          status: 'published',
          created_by: body.changedBy || 'human',
          source_system: 'publishing_gateway',
        });
        const asset = setAssetPublishMetadata(body.assetId, {
          publishedPostId: publishRecord.id,
          platform: publishRecord.platform,
          platformPostId: publishRecord.platform_post_id,
          postUrl: publishRecord.post_url,
          ctaId: publishRecord.cta_id,
          landingPageId: publishRecord.landing_page_id,
          publishedAt: publishRecord.published_at,
        });
        return Response.json({
          success: true,
          asset: transitionAsset(asset.id, body.nextState, body),
          publishedPost: publishRecord,
        });
      }
      return Response.json({ success: true, asset: transitionAsset(body.assetId, body.nextState, body) });
    }
    if (body.action === 'approval') return Response.json({ success: true, asset: recordApproval(body.assetId, body.approvalKey, body.approved, body) });
    if (body.action === 'output') return Response.json({ success: true, asset: updateAssetOutput(body.assetId, body.stageKey, body.payload) });
    if (body.action === 'publishMetadata') return Response.json({ success: true, asset: setAssetPublishMetadata(body.assetId, body.publishMetadata || {}) });
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
