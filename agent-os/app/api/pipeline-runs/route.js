import { getAsset } from '../../../lib/assets.js';
import { getPipelineRun, listPipelineRuns } from '../../../lib/durableStore.js';

function mergeRunWithAsset(run) {
  const asset = run.asset_id ? getAsset(run.asset_id) : null;
  return {
    ...(asset || {}),
    id: asset?.id || run.asset_id || run.id,
    assetId: run.asset_id || asset?.id || '',
    runId: run.id,
    processId: run.process_id,
    sessionId: run.session_id,
    topic: run.topic || asset?.topic || '',
    title: asset?.title || run.topic || 'Untitled Asset',
    pipelineType: run.pipeline_type || asset?.pipelineType || 'content',
    state: asset?.state || 'idea_created',
    outputs: asset?.outputs || {},
    approvals: asset?.approvals || {},
    stageHistory: asset?.stageHistory || [],
    createdAt: asset?.createdAt || run.started_at || '',
    updatedAt: run.updated_at || asset?.updatedAt || '',
    startedAt: run.started_at || asset?.createdAt || '',
    completedAt: run.completed_at || '',
    runStatus: run.status,
    resumeFrom: run.resume_from,
    reportFilename: run.report_filename || '',
    calendarEntryCount: run.calendar_entry_count || 0,
    targetClientId: run.target_client_id || '',
    targetClientName: run.target_client_name || '',
    error: run.error || '',
    metadata: run.metadata || {},
    runEvents: run.events || [],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId') || '';
  const assetId = searchParams.get('assetId') || '';
  const limit = Number(searchParams.get('limit') || 100);

  if (runId) {
    const run = getPipelineRun(runId);
    if (!run) {
      return Response.json({ error: 'Pipeline run not found' }, { status: 404 });
    }
    return Response.json({ run: mergeRunWithAsset(run) });
  }

  const runs = listPipelineRuns({ limit, assetId });
  return Response.json({ assets: runs.map(mergeRunWithAsset) });
}
