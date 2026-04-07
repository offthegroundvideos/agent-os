import fs from 'fs';
import path from 'path';

const PROCESSES_FILE = path.join(process.cwd(), 'data', 'processes.json');
const STALE_RUNNING_MS = 1000 * 60 * 90;
const STALE_STOPPING_MS = 1000 * 60 * 15;

function ensureFile() {
  const dir = path.dirname(PROCESSES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(PROCESSES_FILE)) {
    fs.writeFileSync(PROCESSES_FILE, JSON.stringify({ processes: [] }, null, 2));
  }
}

function normalizeProcesses(data) {
  const now = Date.now();
  data.processes = (data.processes || []).map((process) => {
    const startedAt = process.startedAt ? new Date(process.startedAt).getTime() : 0;
    const stoppedAt = process.stoppedAt ? new Date(process.stoppedAt).getTime() : 0;
    const runningTooLong = process.status === 'running' && startedAt && (now - startedAt) > STALE_RUNNING_MS;
    const stoppingTooLong = process.status === 'stopping' && stoppedAt && (now - stoppedAt) > STALE_STOPPING_MS;

    if (runningTooLong || stoppingTooLong) {
      return {
        ...process,
        status: 'killed',
        killedAt: new Date().toISOString(),
        reason: process.reason || 'Process marked stale automatically',
      };
    }
    return process;
  });
  return data;
}

// Call this on server startup to clean stale processes
export function clearStaleProcesses() {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }

  // Mark any running/stopping processes as killed on restart
  data.processes = data.processes.map(p => {
    if (p.status === 'running' || p.status === 'stopping') {
      return { ...p, status: 'killed', killedAt: new Date().toISOString(), reason: 'Server restarted' };
    }
    return p;
  });

  // Keep only last 20 processes
  data.processes = data.processes.slice(-20);
  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
}

export function registerProcess(id, type, description, meta = {}) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  data.processes = data.processes.filter(p =>
    p.status === 'running' || p.status === 'stopping'
  );

  data.processes.push({
    id, type, description,
    status: 'running',
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    ...meta,
  });

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
}

export function updateProcessProgress(id, progress) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  const proc = data.processes.find(p => p.id === id);
  if (proc) Object.assign(proc, progress);

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
}

export function resumeProcess(id) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  const proc = data.processes.find(p => p.id === id);
  if (proc) {
    proc.status = 'running';
    proc.stoppedAt = null;
    proc.killedAt = null;
    proc.resumedAt = new Date().toISOString();
  }

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
  return proc || null;
}

export function stopProcess(id) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  const proc = data.processes.find(p => p.id === id);
  if (proc) {
    proc.status = 'stopping';
    proc.stoppedAt = new Date().toISOString();
  }

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
  return proc || null;
}

export function forceKillProcess(id) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  const proc = data.processes.find(p => p.id === id);
  if (proc) {
    proc.status = 'killed';
    proc.killedAt = new Date().toISOString();
  }

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
  return proc || null;
}

export function forceKillAll() {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  data.processes = data.processes.map(p => ({
    ...p,
    status: p.status === 'running' || p.status === 'stopping' ? 'killed' : p.status,
    killedAt: new Date().toISOString(),
  }));

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
  return data.processes;
}

export function clearAllProcesses() {
  fs.writeFileSync(PROCESSES_FILE, JSON.stringify({ processes: [] }, null, 2));
}

export function completeProcess(id, status = 'complete') {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  const proc = data.processes.find(p => p.id === id);
  if (proc) {
    proc.status = status;
    proc.completedAt = new Date().toISOString();
  }

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
}

export function isProcessStopped(id) {
  ensureFile();
  try {
    const data = normalizeProcesses(JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')));
    fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
    const proc = data.processes.find(p => p.id === id);
    return proc?.status === 'stopping' || proc?.status === 'stopped' || proc?.status === 'killed';
  } catch { return false; }
}

export function getProcesses() {
  ensureFile();
  try {
    const data = normalizeProcesses(JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')));
    fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
    return data.processes.slice().reverse();
  } catch { return []; }
}

export function stopAll() {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(PROCESSES_FILE, 'utf-8')); }
  catch { data = { processes: [] }; }
  data = normalizeProcesses(data);

  data.processes = data.processes.map(p =>
    p.status === 'running' ? { ...p, status: 'stopping', stoppedAt: new Date().toISOString() } : p
  );

  fs.writeFileSync(PROCESSES_FILE, JSON.stringify(data, null, 2));
  return data.processes;
}
