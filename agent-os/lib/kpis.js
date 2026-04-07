import fs from 'fs';
import path from 'path';

const KPI_FILE = path.join(process.cwd(), 'data', 'kpis.json');

export const KPI_DEFINITIONS = {
  content: [
    {
      id: 'posts_published_per_week',
      label: 'Posts Published Per Week',
      description: 'Total number of short-form posts published in a 7-day window.',
      formula: 'count(published_posts within 7 days)',
      targetDirection: 'higher',
    },
    {
      id: 'average_watch_time',
      label: 'Average Watch Time',
      description: 'Average number of seconds watched per video.',
      formula: 'sum(total_watch_time_seconds) / total_video_views',
      targetDirection: 'higher',
    },
    {
      id: 'save_rate',
      label: 'Save Rate',
      description: 'Percentage of viewers who saved the content.',
      formula: 'saves / views',
      targetDirection: 'higher',
    },
    {
      id: 'share_rate',
      label: 'Share Rate',
      description: 'Percentage of viewers who shared the content.',
      formula: 'shares / views',
      targetDirection: 'higher',
    },
    {
      id: 'comment_to_dm_conversion',
      label: 'Comment-to-DM Conversion',
      description: 'Percentage of commenters who entered the DM automation flow.',
      formula: 'DM_starts / qualifying_comments',
      targetDirection: 'higher',
    },
    {
      id: 'dm_to_landing_page_conversion',
      label: 'DM-to-Landing-Page Conversion',
      description: 'Percentage of DM conversations that produced a landing page click.',
      formula: 'landing_page_clicks / DM_starts',
      targetDirection: 'higher',
    },
  ],
  system: [
    {
      id: 'time_from_idea_to_publish',
      label: 'Time From Idea To Publish',
      description: 'Elapsed time from approved idea to published asset.',
      formula: 'publish_time - idea_created_time',
      targetDirection: 'lower',
    },
    {
      id: 'scripts_approved_first_pass_rate',
      label: 'Scripts Approved On First Pass',
      description: 'Percentage of drafted scripts that are approved without revisions.',
      formula: 'first_pass_approvals / total_scripts_reviewed',
      targetDirection: 'higher',
    },
    {
      id: 'agent_error_rate',
      label: 'Agent Error Rate',
      description: 'Percentage of agent runs that fail, timeout, or produce unusable output.',
      formula: 'failed_agent_runs / total_agent_runs',
      targetDirection: 'lower',
    },
    {
      id: 'duplicate_work_rate',
      label: 'Duplicate Work Rate',
      description: 'Percentage of finished assets or tasks that duplicated already-completed work.',
      formula: 'duplicate_tasks / total_tasks_completed',
      targetDirection: 'lower',
    },
    {
      id: 'cost_per_finished_asset',
      label: 'Cost Per Finished Asset',
      description: 'Average production cost for each published asset.',
      formula: 'total_content_system_cost / finished_assets',
      targetDirection: 'lower',
    },
    {
      id: 'turnaround_time_per_stage',
      label: 'Turnaround Time Per Stage',
      description: 'Average elapsed time spent in each stage of the workflow.',
      formula: 'stage_completed_time - stage_started_time',
      targetDirection: 'lower',
    },
  ],
};

function ensureFile() {
  const dir = path.dirname(KPI_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(KPI_FILE)) {
    fs.writeFileSync(KPI_FILE, JSON.stringify({
      definitions: KPI_DEFINITIONS,
      entries: [],
      stageTimings: [],
      lastUpdated: null,
    }, null, 2));
  }
}

function loadData() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(KPI_FILE, 'utf-8'));
  } catch {
    return { definitions: KPI_DEFINITIONS, entries: [], stageTimings: [], lastUpdated: null };
  }
}

function saveData(data) {
  ensureFile();
  data.definitions = KPI_DEFINITIONS;
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(KPI_FILE, JSON.stringify(data, null, 2));
}

export function getKpiDashboard() {
  const data = loadData();
  const latestByMetric = {};
  for (const entry of [...data.entries].reverse()) {
    if (!latestByMetric[entry.metricId]) latestByMetric[entry.metricId] = entry;
  }
  return {
    definitions: KPI_DEFINITIONS,
    latestByMetric,
    recentEntries: data.entries.slice(-30).reverse(),
    recentStageTimings: data.stageTimings.slice(-30).reverse(),
    lastUpdated: data.lastUpdated,
  };
}

export function recordKpiEntry(input) {
  const data = loadData();
  const entry = {
    id: `kpi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: input.category,
    metricId: input.metricId,
    value: Number(input.value),
    unit: input.unit || '',
    period: input.period || '',
    notes: input.notes || '',
    assetId: input.assetId || '',
    createdAt: new Date().toISOString(),
  };
  data.entries.push(entry);
  saveData(data);
  return entry;
}

export function recordStageTiming(input) {
  const data = loadData();
  const timing = {
    id: `stage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    stageName: input.stageName,
    assetId: input.assetId || '',
    durationMinutes: Number(input.durationMinutes),
    notes: input.notes || '',
    createdAt: new Date().toISOString(),
  };
  data.stageTimings.push(timing);
  saveData(data);
  return timing;
}
