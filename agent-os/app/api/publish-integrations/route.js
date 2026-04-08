import { listPublishJobs } from '../../../lib/publishQueue.js';
import { getPublishingIntegrationStatus, testInstagramConnection, testYouTubeConnection } from '../../../lib/publishingGateway.js';
import { savePublishRuntime } from '../../../lib/publishRuntime.js';
import { refreshAllRenderMediaUrls, getProductionBundleForCalendarEntry } from '../../../lib/productionOps.js';
import { updatePublishJob, listPublishJobs as listQueueJobs } from '../../../lib/publishQueue.js';

export async function GET() {
  try {
    const jobs = listPublishJobs({});
    return Response.json({
      success: true,
      status: getPublishingIntegrationStatus(jobs),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || '').trim().toLowerCase();

    if (action === 'update-settings') {
      const runtime = savePublishRuntime({
        publicMediaBaseUrl: body.publicMediaBaseUrl,
        nextPublicAppUrl: body.nextPublicAppUrl,
        instagramMode: body.instagramMode,
        facebookMode: body.facebookMode,
        tiktokMode: body.tiktokMode,
        youtubeMode: body.youtubeMode,
        linkedinMode: body.linkedinMode,
        xMode: body.xMode,
      });
      return Response.json({ success: true, runtime });
    }

    if (action === 'sync-media-host') {
      const renderJobs = refreshAllRenderMediaUrls();
      const jobs = listQueueJobs({});
      const updatedJobs = jobs.map((job) => {
        const bundle = job.calendar_entry_id ? getProductionBundleForCalendarEntry(job.calendar_entry_id) : null;
        const nextMediaUrl =
          bundle?.renderJob?.output_urls?.[String(job.platform || '').toLowerCase()] ||
          bundle?.renderJob?.public_media_url ||
          job.media_url ||
          '';
        return updatePublishJob(job.id, {
          media_url: nextMediaUrl,
          render_job_id: bundle?.renderJob?.id || job.render_job_id,
        });
      });

      return Response.json({
        success: true,
        synced: {
          renderJobs: renderJobs.length,
          publishJobs: updatedJobs.length,
        },
        status: getPublishingIntegrationStatus(listQueueJobs({})),
      });
    }

    if (action === 'test-instagram-connection' || action === 'testinstagramconnection' || action === 'test-instagram') {
      const result = await testInstagramConnection();
      return Response.json({ success: result.ok, result });
    }

    if (action === 'test-youtube-connection' || action === 'testyoutubeconnection' || action === 'test-youtube') {
      const result = await testYouTubeConnection();
      return Response.json({ success: result.ok, result }, { status: result.ok ? 200 : 400 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
