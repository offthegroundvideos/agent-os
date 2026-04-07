import fs from 'fs';
import path from 'path';

const CHAPTERS_FILE = path.join(process.cwd(), 'data', 'chapters', 'chapters.json');
const SESSIONS_FILE = path.join(process.cwd(), 'data', 'chapters', 'sessions.json');

function ensureFiles() {
  const dir = path.dirname(CHAPTERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CHAPTERS_FILE)) {
    fs.writeFileSync(CHAPTERS_FILE, JSON.stringify({ chapters: [] }, null, 2));
  }
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({ sessions: [], activeSession: null }, null, 2));
  }
}

// Team members
export const TEAM_MEMBERS = {
  jack: { id: 'jack', name: 'Jack Riggs', color: '#f59e0b', icon: '⚡', role: 'Founder' },
  jake: { id: 'jake', name: 'Jake Evans', color: '#3b82f6', icon: '🎯', role: 'Operations' },
  team: { id: 'team', name: 'OTG Team', color: '#10b981', icon: '🌟', role: 'General' },
};

// Start a new session
export function startSession(memberId, goals = '') {
  ensureFiles();
  let data;
  try { data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { data = { sessions: [], activeSession: null }; }

  const session = {
    id: 'session-' + Date.now(),
    memberId,
    memberName: TEAM_MEMBERS[memberId]?.name || memberId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    goals,
    accomplishments: [],
    agentsUsed: [],
    pipelinesRun: [],
    notes: '',
    status: 'active',
  };

  data.sessions.push(session);
  data.activeSession = session.id;
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
  return session;
}

// Log an accomplishment to active session
export function logAccomplishment(description, agentId = null) {
  ensureFiles();
  let data;
  try { data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return; }

  const session = data.sessions.find(s => s.id === data.activeSession);
  if (!session) return;

  session.accomplishments.push({
    description,
    agentId,
    timestamp: new Date().toISOString(),
  });

  if (agentId && !session.agentsUsed.includes(agentId)) {
    session.agentsUsed.push(agentId);
  }

  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

// Log a pipeline run
export function logPipelineRun(topic, sessionId) {
  ensureFiles();
  let data;
  try { data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return; }

  const session = data.sessions.find(s => s.id === data.activeSession);
  if (!session) return;

  session.pipelinesRun.push({ topic, sessionId, timestamp: new Date().toISOString() });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
}

// Close current session and create a chapter
export function closeSession(notes = '', nextSteps = '') {
  ensureFiles();
  let sessionData;
  try { sessionData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { return null; }

  const session = sessionData.sessions.find(s => s.id === sessionData.activeSession);
  if (!session) return null;

  session.endedAt = new Date().toISOString();
  session.notes = notes;
  session.nextSteps = nextSteps;
  session.status = 'complete';
  session.duration = Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000) + ' minutes';
  sessionData.activeSession = null;

  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionData, null, 2));

  // Create a chapter from this session
  let chapterData;
  try { chapterData = JSON.parse(fs.readFileSync(CHAPTERS_FILE, 'utf-8')); }
  catch { chapterData = { chapters: [] }; }

  const chapter = {
    id: 'chapter-' + Date.now(),
    number: chapterData.chapters.length + 1,
    sessionId: session.id,
    memberId: session.memberId,
    memberName: session.memberName,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    duration: session.duration,
    goals: session.goals,
    accomplishments: session.accomplishments,
    agentsUsed: session.agentsUsed,
    pipelinesRun: session.pipelinesRun,
    notes,
    nextSteps,
  };

  chapterData.chapters.push(chapter);
  fs.writeFileSync(CHAPTERS_FILE, JSON.stringify(chapterData, null, 2));
  return chapter;
}

// Get progress report for returning team member
export function getProgressReport(memberId = null) {
  ensureFiles();
  let chapterData, sessionData;
  try { chapterData = JSON.parse(fs.readFileSync(CHAPTERS_FILE, 'utf-8')); }
  catch { chapterData = { chapters: [] }; }
  try { sessionData = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); }
  catch { sessionData = { sessions: [], activeSession: null }; }

  const allChapters = chapterData.chapters.slice().reverse();
  const recentChapters = allChapters.slice(0, 10);

  // Find last chapter by this member
  const myLastChapter = allChapters.find(c => c.memberId === memberId);

  // Find chapters since my last session
  const myLastIdx = myLastChapter
    ? allChapters.findIndex(c => c.id === myLastChapter.id)
    : allChapters.length;
  const chaptersWhileAway = allChapters.slice(0, myLastIdx);

  // Active session info
  const activeSession = sessionData.activeSession
    ? sessionData.sessions.find(s => s.id === sessionData.activeSession)
    : null;

  return {
    totalChapters: chapterData.chapters.length,
    recentChapters,
    chaptersWhileAway,
    myLastChapter,
    activeSession,
    allChapters,
  };
}

export function getActiveSession() {
  ensureFiles();
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    if (!data.activeSession) return null;
    return data.sessions.find(s => s.id === data.activeSession) || null;
  } catch { return null; }
}

export function getAllChapters() {
  ensureFiles();
  try {
    const data = JSON.parse(fs.readFileSync(CHAPTERS_FILE, 'utf-8'));
    return data.chapters.slice().reverse();
  } catch { return []; }
}

export function getAllSessions() {
  ensureFiles();
  try {
    const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    return data.sessions.slice().reverse();
  } catch { return []; }
}