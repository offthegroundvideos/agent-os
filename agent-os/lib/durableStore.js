import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

const DB_FILE = path.join(process.cwd(), 'data', 'durable.sqlite');
const DEFAULT_QUEUE_NAME = 'background';
const STALE_JOB_MINUTES = 30;

function getState() {
  const globalKey = '__agentOsDurableStore';
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = {
      db: null,
      schemaReady: false,
    };
  }
  return globalThis[globalKey];
}

function ensureDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getDb() {
  const state = getState();
  if (state.db) return state.db;

  ensureDir();
  state.db = new DatabaseSync(DB_FILE);
  state.db.exec('PRAGMA journal_mode = WAL;');
  state.db.exec('PRAGMA synchronous = NORMAL;');
  state.db.exec('PRAGMA foreign_keys = ON;');
  if (!state.schemaReady) {
    state.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id TEXT PRIMARY KEY,
        process_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        pipeline_type TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        target_client_id TEXT DEFAULT '',
        target_client_name TEXT DEFAULT '',
        status TEXT NOT NULL,
        resume_from INTEGER NOT NULL DEFAULT 0,
        report_filename TEXT DEFAULT '',
        calendar_entry_count INTEGER NOT NULL DEFAULT 0,
        error TEXT DEFAULT '',
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_updated_at ON pipeline_runs(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_asset_id ON pipeline_runs(asset_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);

      CREATE TABLE IF NOT EXISTS pipeline_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        step_index INTEGER NOT NULL DEFAULT 0,
        agent_id TEXT DEFAULT '',
        agent_name TEXT DEFAULT '',
        message TEXT DEFAULT '',
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_pipeline_events_run_id ON pipeline_events(run_id, id);

      CREATE TABLE IF NOT EXISTS background_jobs (
        id TEXT PRIMARY KEY,
        queue_name TEXT NOT NULL DEFAULT 'background',
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        payload_json TEXT NOT NULL DEFAULT '{}',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        available_at TEXT NOT NULL,
        locked_at TEXT DEFAULT '',
        locked_by TEXT DEFAULT '',
        started_at TEXT DEFAULT '',
        completed_at TEXT DEFAULT '',
        failed_at TEXT DEFAULT '',
        error TEXT DEFAULT '',
        result_json TEXT NOT NULL DEFAULT '{}',
        related_run_id TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_background_jobs_queue_status ON background_jobs(queue_name, status, priority, available_at);
      CREATE INDEX IF NOT EXISTS idx_background_jobs_related_run ON background_jobs(related_run_id);
    `);
    state.schemaReady = true;
  }

  return state.db;
}

function rowToPipelineRun(row) {
  if (!row) return null;
  return {
    ...row,
    resume_from: Number(row.resume_from || 0),
    calendar_entry_count: Number(row.calendar_entry_count || 0),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function rowToPipelineEvent(row) {
  if (!row) return null;
  return {
    ...row,
    step_index: Number(row.step_index || 0),
    payload: parseJson(row.payload_json, {}),
  };
}

function rowToBackgroundJob(row) {
  if (!row) return null;
  return {
    ...row,
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    max_attempts: Number(row.max_attempts || 3),
    payload: parseJson(row.payload_json, {}),
    result: parseJson(row.result_json, {}),
  };
}

function upsertPipelineRunInternal(input = {}) {
  const db = getDb();
  const id = String(input.id || input.processId || input.sessionId || '').trim();
  if (!id) throw new Error('Pipeline run id is required');

  const now = nowIso();
  const existing = getPipelineRun(id);
  const createdAt = existing?.started_at || now;
  const status = String(input.status || existing?.status || 'running').trim();
  const completedAt = input.completedAt || existing?.completed_at || (status === 'complete' || status === 'failed' || status === 'stopped' ? now : '');

  db.prepare(`
    INSERT INTO pipeline_runs (
      id, process_id, session_id, topic, pipeline_type, asset_id, target_client_id, target_client_name,
      status, resume_from, report_filename, calendar_entry_count, error, started_at, updated_at, completed_at, metadata_json
    ) VALUES (
      @id, @process_id, @session_id, @topic, @pipeline_type, @asset_id, @target_client_id, @target_client_name,
      @status, @resume_from, @report_filename, @calendar_entry_count, @error, @started_at, @updated_at, @completed_at, @metadata_json
    )
    ON CONFLICT(id) DO UPDATE SET
      process_id = excluded.process_id,
      session_id = excluded.session_id,
      topic = excluded.topic,
      pipeline_type = excluded.pipeline_type,
      asset_id = excluded.asset_id,
      target_client_id = excluded.target_client_id,
      target_client_name = excluded.target_client_name,
      status = excluded.status,
      resume_from = excluded.resume_from,
      report_filename = excluded.report_filename,
      calendar_entry_count = excluded.calendar_entry_count,
      error = excluded.error,
      updated_at = excluded.updated_at,
      completed_at = CASE
        WHEN excluded.completed_at != '' THEN excluded.completed_at
        ELSE pipeline_runs.completed_at
      END,
      metadata_json = excluded.metadata_json
  `).run({
    id,
    process_id: String(input.processId || id),
    session_id: String(input.sessionId || id),
    topic: String(input.topic || existing?.topic || ''),
    pipeline_type: String(input.pipelineType || existing?.pipeline_type || 'content'),
    asset_id: String(input.assetId || existing?.asset_id || ''),
    target_client_id: String(input.targetClientId || existing?.target_client_id || ''),
    target_client_name: String(input.targetClientName || existing?.target_client_name || ''),
    status,
    resume_from: Number(input.resumeFrom || existing?.resume_from || 0),
    report_filename: String(input.reportFilename || existing?.report_filename || ''),
    calendar_entry_count: Number(input.calendarEntryCount ?? existing?.calendar_entry_count ?? 0),
    error: String(input.error || existing?.error || ''),
    started_at: createdAt,
    updated_at: now,
    completed_at: completedAt || '',
    metadata_json: safeJson({
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
    }),
  });

  return getPipelineRun(id);
}

function claimStaleJobs(db) {
  db.prepare(`
    UPDATE background_jobs
    SET status = 'queued',
        locked_at = '',
        locked_by = '',
        started_at = '',
        error = 'Reclaimed after worker interruption',
        updated_at = ?
    WHERE status = 'running'
      AND locked_at != ''
      AND datetime(locked_at) < datetime('now', ?)
  `).run(nowIso(), `-${STALE_JOB_MINUTES} minutes`);
}

export function recordPipelineRunStart(input = {}) {
  return upsertPipelineRunInternal({
    ...input,
    status: 'running',
    metadata: {
      ...(input.metadata || {}),
      started: true,
    },
  });
}

export function recordPipelineRunEvent(runId, input = {}) {
  const db = getDb();
  if (!runId) return null;
  const now = nowIso();
  db.prepare(`
    INSERT INTO pipeline_events (
      run_id, event_type, step_index, agent_id, agent_name, message, payload_json, created_at
    ) VALUES (
      @run_id, @event_type, @step_index, @agent_id, @agent_name, @message, @payload_json, @created_at
    )
  `).run({
    run_id: runId,
    event_type: String(input.eventType || 'event'),
    step_index: Number(input.stepIndex || 0),
    agent_id: String(input.agentId || ''),
    agent_name: String(input.agentName || ''),
    message: String(input.message || ''),
    payload_json: safeJson(input.payload || {}),
    created_at: now,
  });
  return true;
}

export function recordPipelineRunStep(runId, input = {}) {
  recordPipelineRunEvent(runId, {
    eventType: input.eventType || 'step_complete',
    stepIndex: input.stepIndex || 0,
    agentId: input.agentId || '',
    agentName: input.agentName || '',
    message: input.message || '',
    payload: {
      stepLabel: input.stepLabel || '',
      model: input.model || '',
      wordCount: Number(input.wordCount || 0),
      hasStructuredHandoff: Boolean(input.hasStructuredHandoff),
      narrativeSummary: input.narrativeSummary || '',
      outputPreview: String(input.output || '').slice(0, 4000),
      handoffJson: input.handoffJson || null,
    },
  });

  return upsertPipelineRunInternal({
    id: runId,
    processId: input.processId,
    sessionId: input.sessionId,
    topic: input.topic,
    pipelineType: input.pipelineType,
    assetId: input.assetId,
    targetClientId: input.targetClientId,
    targetClientName: input.targetClientName,
    resumeFrom: input.resumeFrom,
    status: input.status || 'running',
    metadata: {
      stepIndex: Number(input.stepIndex || 0),
      lastAgentId: input.agentId || '',
      lastStepLabel: input.stepLabel || '',
      lastModel: input.model || '',
    },
  });
}

export function recordPipelineRunComplete(runId, input = {}) {
  recordPipelineRunEvent(runId, {
    eventType: input.eventType || 'complete',
    message: input.message || 'Pipeline completed',
    payload: input.payload || {},
  });

  return upsertPipelineRunInternal({
    id: runId,
    processId: input.processId,
    sessionId: input.sessionId,
    topic: input.topic,
    pipelineType: input.pipelineType,
    assetId: input.assetId,
    targetClientId: input.targetClientId,
    targetClientName: input.targetClientName,
    resumeFrom: input.resumeFrom,
    status: input.status || 'complete',
    reportFilename: input.reportFilename || '',
    calendarEntryCount: Number(input.calendarEntryCount || 0),
    metadata: {
      finalReportReady: true,
      completedStepCount: Number(input.completedStepCount || 0),
    },
  });
}

export function recordPipelineRunFailure(runId, input = {}) {
  recordPipelineRunEvent(runId, {
    eventType: input.eventType || 'failed',
    message: input.message || input.error || 'Pipeline failed',
    payload: input.payload || {},
  });

  return upsertPipelineRunInternal({
    id: runId,
    processId: input.processId,
    sessionId: input.sessionId,
    topic: input.topic,
    pipelineType: input.pipelineType,
    assetId: input.assetId,
    targetClientId: input.targetClientId,
    targetClientName: input.targetClientName,
    resumeFrom: input.resumeFrom,
    status: input.status || 'failed',
    error: input.error || '',
    metadata: {
      failed: true,
    },
  });
}

export function getPipelineRun(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id);
  if (!row) return null;
  const events = db.prepare('SELECT * FROM pipeline_events WHERE run_id = ? ORDER BY id ASC').all(id).map(rowToPipelineEvent);
  return {
    ...rowToPipelineRun(row),
    events,
  };
}

export function listPipelineRuns(filters = {}) {
  const db = getDb();
  const where = [];
  const params = [];

  if (filters.assetId) {
    where.push('asset_id = ?');
    params.push(String(filters.assetId));
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(String(filters.status));
  }
  if (filters.pipelineType) {
    where.push('pipeline_type = ?');
    params.push(String(filters.pipelineType));
  }
  if (filters.targetClientId) {
    where.push('target_client_id = ?');
    params.push(String(filters.targetClientId));
  }

  const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));
  const sql = `SELECT * FROM pipeline_runs${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY datetime(updated_at) DESC, datetime(started_at) DESC LIMIT ${limit}`;
  return db.prepare(sql).all(...params).map(rowToPipelineRun);
}

export function enqueueBackgroundJob(jobType, payload = {}, options = {}) {
  const db = getDb();
  const now = nowIso();
  const id = String(options.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const queueName = String(options.queueName || DEFAULT_QUEUE_NAME);
  const availableAt = options.availableAt || now;
  const priority = Number(options.priority || 0);
  const maxAttempts = Number(options.maxAttempts || 3);
  const relatedRunId = String(options.relatedRunId || payload?.runId || payload?.processId || '');

  db.prepare(`
    INSERT INTO background_jobs (
      id, queue_name, job_type, status, priority, payload_json, attempts, max_attempts,
      available_at, locked_at, locked_by, started_at, completed_at, failed_at, error,
      result_json, related_run_id, created_at, updated_at
    ) VALUES (
      @id, @queue_name, @job_type, 'queued', @priority, @payload_json, 0, @max_attempts,
      @available_at, '', '', '', '', '', '',
      '{}', @related_run_id, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      queue_name = excluded.queue_name,
      job_type = excluded.job_type,
      priority = excluded.priority,
      payload_json = excluded.payload_json,
      max_attempts = excluded.max_attempts,
      available_at = excluded.available_at,
      related_run_id = excluded.related_run_id,
      updated_at = excluded.updated_at
  `).run({
    id,
    queue_name: queueName,
    job_type: String(jobType),
    priority,
    payload_json: safeJson(payload, {}),
    max_attempts: maxAttempts,
    available_at: availableAt,
    related_run_id: relatedRunId,
    created_at: now,
    updated_at: now,
  });

  return getBackgroundJob(id);
}

export function claimBackgroundJob(workerId = 'worker', queueName = DEFAULT_QUEUE_NAME) {
  const db = getDb();
  claimStaleJobs(db);
  const now = nowIso();

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const row = db.prepare(`
      SELECT *
      FROM background_jobs
      WHERE queue_name = ?
        AND status = 'queued'
        AND datetime(available_at) <= datetime('now')
      ORDER BY priority DESC, datetime(created_at) ASC
      LIMIT 1
    `).get(queueName);

    if (!row) {
      db.exec('COMMIT');
      return null;
    }

    db.prepare(`
      UPDATE background_jobs
      SET status = 'running',
          attempts = attempts + 1,
          locked_at = ?,
          locked_by = ?,
          started_at = COALESCE(started_at, ?),
          updated_at = ?
      WHERE id = ?
    `).run(now, workerId, now, now, row.id);

    db.exec('COMMIT');
    return getBackgroundJob(row.id);
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function completeBackgroundJob(id, result = {}) {
  const db = getDb();
  const now = nowIso();
  db.prepare(`
    UPDATE background_jobs
    SET status = 'completed',
        completed_at = ?,
        locked_at = '',
        locked_by = '',
        error = '',
        result_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, safeJson(result, {}), now, id);
  return getBackgroundJob(id);
}

export function failBackgroundJob(id, error, result = {}) {
  const db = getDb();
  const now = nowIso();
  const message = String(error?.message || error || 'Job failed');
  const current = getBackgroundJob(id);
  const nextStatus = current && current.attempts < current.max_attempts ? 'queued' : 'failed';
  const nextAvailableAt = nextStatus === 'queued'
    ? new Date(Date.now() + Math.min(300000, 15000 * Math.max(1, current?.attempts || 1))).toISOString()
    : current?.available_at || now;

  db.prepare(`
    UPDATE background_jobs
    SET status = ?,
        completed_at = CASE WHEN ? = 'failed' THEN ? ELSE completed_at END,
        locked_at = '',
        locked_by = '',
        failed_at = ?,
        available_at = ?,
        error = ?,
        result_json = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    nextStatus,
    nextStatus,
    now,
    now,
    nextAvailableAt,
    message,
    safeJson(result, {}),
    now,
    id
  );

  return getBackgroundJob(id);
}

export function getBackgroundJob(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(id);
  return rowToBackgroundJob(row);
}

export function listBackgroundJobs(filters = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (filters.queueName) {
    where.push('queue_name = ?');
    params.push(String(filters.queueName));
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(String(filters.status));
  }
  if (filters.jobType) {
    where.push('job_type = ?');
    params.push(String(filters.jobType));
  }
  const limit = Math.max(1, Math.min(Number(filters.limit || 100), 500));
  const sql = `SELECT * FROM background_jobs${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC LIMIT ${limit}`;
  return db.prepare(sql).all(...params).map(rowToBackgroundJob);
}

export function getDurableStoreSummary() {
  return {
    dbFile: DB_FILE,
    pipelineRunCount: listPipelineRuns({ limit: 1_000_000 }).length,
    queuedJobCount: listBackgroundJobs({ status: 'queued', limit: 1_000_000 }).length,
    runningJobCount: listBackgroundJobs({ status: 'running', limit: 1_000_000 }).length,
  };
}
