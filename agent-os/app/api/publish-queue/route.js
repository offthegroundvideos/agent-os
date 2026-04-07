import { getAsset, recordApproval, setAssetPublishMetadata, transitionAsset } from '../../../lib/assets.js';
import { listCalendarEntries, updateCalendarEntry } from '../../../lib/contentCalendar.js';
import { upsertPublishedPost } from '../../../lib/contentRecords.js';
import { addAttributionTouch, findBestLandingPageMatch } from '../../../lib/funnelRecords.js';
import { ensurePublishJobsForCalendarEntry, getPublishJob, listPublishJobs, updatePublishJob, upsertPublishJob } from '../../../lib/publishQueue.js';
import { getPublishingGatewaySummary, publishWithGateway } from '../../../lib/publishingGateway.js';
import { getProductionBundleForCalendarEntry } from '../../../lib/productionOps.js';

function resolveCalendarEntry(job) {
  return listCalendarEntries({}).find((entry) => entry.id === job.calendar_entry_id) || null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId') || '';
  const status = searchParams.get('status') || '';
  const client_id = searchParams.get('client_id') || '';
  const calendar_entry_id = searchParams.get('calendar_entry_id') || '';
  const asset_id = searchParams.get('asset_id') || '';
  if (jobId) {
    return Response.json(getPublishJob(jobId) || { error: 'Publish job not found' }, { status: getPublishJob(jobId) ? 200 : 404 });
  }
  return Response.json(listPublishJobs({ status, client_id, calendar_entry_id, asset_id }));
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body.action === 'enqueue') {
      const entry = listCalendarEntries({}).find((item) => item.id === body.entryId);
      if (!entry) {
        return Response.json({ error: 'Calendar entry not found' }, { status: 404 });
      }
      const jobs = ensurePublishJobsForCalendarEntry(entry);
      return Response.json({ success: true, jobs });
    }

    if (body.action === 'update') {
      return Response.json({ success: true, job: updatePublishJob(body.jobId, body.patch || {}) });
    }

    if (body.action === 'publish') {
      const job = getPublishJob(body.jobId);
      if (!job) return Response.json({ error: 'Publish job not found' }, { status: 404 });

      const calendarEntry = resolveCalendarEntry(job);
      const productionBundle = job.calendar_entry_id ? getProductionBundleForCalendarEntry(job.calendar_entry_id) : null;
      const asset = job.asset_id ? getAsset(job.asset_id) : null;
      const landingPage = findBestLandingPageMatch({
        client_id: job.client_id,
        campaign_id: job.campaign_id,
        cta_id: job.cta_id,
      });

      updatePublishJob(job.id, { publish_status: 'publishing', error: '' });

      if (asset) {
        try {
          if (!asset.approvals?.publishApproved) {
            recordApproval(asset.id, 'publishApproved', true, { changedBy: body.changedBy || 'human', reason: 'Publish queue approval' });
          }
          const refreshed = getAsset(asset.id);
          if (refreshed?.state === 'final_qa') {
            if (!refreshed.approvals?.finalQaApproved) {
              recordApproval(asset.id, 'finalQaApproved', true, { changedBy: body.changedBy || 'human', reason: 'Publish queue final QA approval' });
            }
            transitionAsset(asset.id, 'scheduled', { changedBy: body.changedBy || 'human', reason: 'Queued for publish' });
          }
        } catch {}
      }

      const gatewayResult = await publishWithGateway(
        {
          ...job,
          landing_page_id: landingPage?.id || job.landing_page_id || 'lpg_default',
        },
        {
          calendarEntry,
          asset,
          renderJob: productionBundle?.renderJob || null,
        }
      );
      const platformPostId = body.platformPostId || gatewayResult.platform_post_id;
      const postUrl = body.postUrl || gatewayResult.post_url;
      const publishedPost = upsertPublishedPost({
        content_asset_id: job.content_asset_id || job.asset_id,
        client_id: job.client_id,
        platform: job.platform,
        publish_method: gatewayResult.method,
        adapter_mode: gatewayResult.adapter_mode,
        platform_payload: gatewayResult.platform_payload,
        platform_post_id: platformPostId,
        post_url: postUrl,
        cta_id: job.cta_id,
        landing_page_id: landingPage?.id || job.landing_page_id || 'lpg_default',
        published_at: body.publishedAt || gatewayResult.published_at || new Date().toISOString(),
        status: 'published',
        created_by: body.changedBy || 'human',
        source_system: 'publishing_gateway',
      });

      addAttributionTouch({
        client_id: job.client_id,
        campaign_id: job.campaign_id,
        content_asset_id: job.content_asset_id || job.asset_id,
        published_post_id: publishedPost.id,
        platform: job.platform,
        cta_id: job.cta_id,
        landing_page_id: publishedPost.landing_page_id,
        touch_type: 'cta_triggered',
        utm_source: job.platform,
        utm_medium: 'organic_social',
        utm_campaign: job.campaign_id,
        source_system: 'publishing_gateway',
      });

      const updatedJob = updatePublishJob(job.id, {
        publish_status: 'published',
        publish_method: gatewayResult.method,
        adapter_mode: gatewayResult.adapter_mode,
        platform_payload: gatewayResult.platform_payload,
        attempts: Number(job.attempts || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        published_post_id: publishedPost.id,
        published_at: publishedPost.published_at,
        platform_post_id: platformPostId,
        post_url: postUrl,
        landing_page_id: publishedPost.landing_page_id,
      });

      if (asset) {
        try {
          const currentAsset = getAsset(asset.id);
          const existingPlatforms = currentAsset?.publishMetadata?.platformPosts || {};
          setAssetPublishMetadata(asset.id, {
            queueJobId: job.id,
            publishedPostId: publishedPost.id,
            landingPageId: publishedPost.landing_page_id,
            ctaId: job.cta_id,
            platform: job.platform,
            publishMethod: gatewayResult.method,
            adapterMode: gatewayResult.adapter_mode,
            platformPayload: gatewayResult.platform_payload,
            platformPostId,
            postUrl,
            publishedAt: publishedPost.published_at,
            publishStatus: 'published',
            platformPosts: {
              ...existingPlatforms,
              [job.platform]: {
                queueJobId: job.id,
                publishedPostId: publishedPost.id,
                landingPageId: publishedPost.landing_page_id,
                ctaId: job.cta_id,
                publishMethod: gatewayResult.method,
                adapterMode: gatewayResult.adapter_mode,
                platformPayload: gatewayResult.platform_payload,
                platformPostId,
                postUrl,
                publishedAt: publishedPost.published_at,
                publishStatus: 'published',
              },
            },
          });
        } catch {}
      }

      if (calendarEntry) {
        const siblingJobs = listPublishJobs({ calendar_entry_id: calendarEntry.id });
        const allPublished = siblingJobs.length > 0 && siblingJobs.every((item) => item.publish_status === 'published');
        updateCalendarEntry(calendarEntry.id, { status: allPublished ? 'published' : 'scheduled' });
      }

      if (asset) {
        try {
          const refreshed = getAsset(asset.id);
          if (refreshed?.state === 'scheduled') {
            transitionAsset(asset.id, 'published', { changedBy: body.changedBy || 'human', reason: 'Published from queue' });
          }
        } catch {}
      }

      return Response.json({ success: true, job: updatedJob, publishedPost });
    }

    if (body.action === 'fail') {
      const job = updatePublishJob(body.jobId, {
        publish_status: 'failed',
        attempts: Number(getPublishJob(body.jobId)?.attempts || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_error_at: new Date().toISOString(),
        error: body.error || 'Publish failed',
      });
      if (job.asset_id) {
        try {
          const currentAsset = getAsset(job.asset_id);
          const existingPlatforms = currentAsset?.publishMetadata?.platformPosts || {};
          setAssetPublishMetadata(job.asset_id, {
            queueJobId: job.id,
            platform: job.platform,
            publishStatus: 'failed',
            error: job.error,
            platformPosts: {
              ...existingPlatforms,
              [job.platform]: {
                queueJobId: job.id,
                publishStatus: 'failed',
                error: job.error,
                lastErrorAt: job.last_error_at,
              },
            },
          });
        } catch {}
      }
      return Response.json({ success: true, job });
    }

    if (body.action === 'create') {
      const job = upsertPublishJob(body.data || body);
      return Response.json({ success: true, job });
    }

    if (body.action === 'preview') {
      const sourceJob = body.jobId ? getPublishJob(body.jobId) : null;
      const draft = sourceJob || upsertPublishJob(body.data || body);
      const calendarEntry = draft.calendar_entry_id ? resolveCalendarEntry(draft) : null;
      const productionBundle = draft.calendar_entry_id ? getProductionBundleForCalendarEntry(draft.calendar_entry_id) : null;
      return Response.json({
        success: true,
        preview: getPublishingGatewaySummary(draft, { calendarEntry, renderJob: productionBundle?.renderJob || null }),
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
