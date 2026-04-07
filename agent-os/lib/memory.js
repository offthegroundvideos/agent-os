import fs from 'fs';
import path from 'path';

const MEMORY_DIR = path.join(process.cwd(), 'data', 'memory');
const WORKSPACE_DIR = path.join(process.cwd(), 'data', 'workspace');
const ALL_AGENT_IDS = ['alex', 'maya', 'jordan', 'dev', 'sam', 'luna', 'iris', 'rex', 'nova', 'pixel', 'ceo', 'cto'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getMemoryPath(agentId) {
  ensureDir(MEMORY_DIR);
  return path.join(MEMORY_DIR, `${agentId}.json`);
}

function getWorkspacePath(agentId) {
  const dir = path.join(WORKSPACE_DIR, agentId);
  ensureDir(dir);
  return dir;
}

export function loadMemory(agentId) {
  const memPath = getMemoryPath(agentId);
  if (!fs.existsSync(memPath)) {
    const def = { agentId, conversations: [], notes: [], lastActive: null, sessionCount: 0 };
    fs.writeFileSync(memPath, JSON.stringify(def, null, 2));
    return def;
  }
  try { return JSON.parse(fs.readFileSync(memPath, 'utf-8')); }
  catch { return { agentId, conversations: [], notes: [], lastActive: null, sessionCount: 0 }; }
}

export function saveMemory(agentId, memory) {
  ensureDir(MEMORY_DIR);
  fs.writeFileSync(getMemoryPath(agentId), JSON.stringify(memory, null, 2));
}

export function addToMemory(agentId, role, content) {
  const memory = loadMemory(agentId);
  memory.conversations.push({ role, content, timestamp: new Date().toISOString() });
  if (memory.conversations.length > 50) memory.conversations = memory.conversations.slice(-50);
  memory.lastActive = new Date().toISOString();
  memory.sessionCount = (memory.sessionCount || 0) + 1;
  saveMemory(agentId, memory);
  return memory;
}

export function getConversationHistory(agentId) {
  const memory = loadMemory(agentId);
  return memory.conversations.map(c => ({ role: c.role, content: c.content }));
}

export function clearMemory(agentId) {
  const memory = loadMemory(agentId);
  memory.conversations = [];
  memory.notes = [];
  saveMemory(agentId, memory);
}

export function saveToWorkspace(agentId, filename, content) {
  const dir = getWorkspacePath(agentId);
  const targetPath = path.join(dir, filename);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

export function listWorkspace(agentId) {
  const dir = getWorkspacePath(agentId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(file => ({
    name: file,
    modified: fs.statSync(path.join(dir, file)).mtime,
  }));
}

export function getAllMemorySummary() {
  return ALL_AGENT_IDS.map(agentId => {
    const memory = loadMemory(agentId);
    return { agentId, messageCount: memory.conversations.length, sessionCount: memory.sessionCount || 0, lastActive: memory.lastActive };
  });
}
