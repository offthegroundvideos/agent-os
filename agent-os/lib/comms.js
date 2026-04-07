import fs from 'fs';
import path from 'path';

const COMMS_FILE = path.join(process.cwd(), 'data', 'comms.json');

function ensureFile() {
  if (!fs.existsSync(path.dirname(COMMS_FILE))) {
    fs.mkdirSync(path.dirname(COMMS_FILE), { recursive: true });
  }
  if (!fs.existsSync(COMMS_FILE)) {
    fs.writeFileSync(COMMS_FILE, JSON.stringify({ sessions: [] }, null, 2));
  }
}

// Extract the most distinctive words (6+ chars, stops noise words)
const STOP_WORDS = new Set([
  'content', 'should', 'create', 'would', 'their', 'through', 'following',
  'provide', 'ensure', 'include', 'strategy', 'platform', 'target', 'audience',
  'marketing', 'business', 'service', 'product', 'specific', 'approach',
  'important', 'different', 'another', 'number', 'example', 'information',
  'potential', 'current', 'effective', 'results', 'growth', 'social',
]);

function extractKeyTopics(content) {
  const words = content.toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 5 && !STOP_WORDS.has(w));
  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}

// Measure how much of the sender's key topics appear in the receiver's output.
// This is the real context pickup rate — called AFTER the receiving agent completes.
function measureTopicPickup(senderTopics, receiverOutput) {
  if (!senderTopics?.length) return { confidence: 0, pickedUpTopics: [], droppedTopics: [], topicPickupRate: 0 };
  const lower = receiverOutput.toLowerCase();
  const pickedUp = senderTopics.filter(t => lower.includes(t));
  const dropped = senderTopics.filter(t => !lower.includes(t));
  const topicPickupRate = Math.round((pickedUp.length / senderTopics.length) * 100);
  // Confidence: 70% from topic pickup, 30% bonus for high pickup density
  const confidence = Math.min(100, Math.round(topicPickupRate * 0.7 + Math.min(pickedUp.length, 5) * 6));
  return {
    confidence,
    pickedUpTopics: pickedUp,
    droppedTopics: dropped,
    topicPickupRate,
  };
}

// Log what the FROM agent produced and what it's passing to the TO agent.
// context.usedPreviousContext starts as null — filled in by updateHandoffUsage after TO agent completes.
export function logHandoff(sessionId, fromAgent, toAgent, summary, fullContent, topic) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(COMMS_FILE, 'utf-8')); }
  catch { data = { sessions: [] }; }

  let session = data.sessions.find(s => s.id === sessionId);
  if (!session) {
    session = {
      id: sessionId,
      topic,
      startedAt: new Date().toISOString(),
      handoffs: [],
      status: 'running',
    };
    data.sessions.push(session);
  }

  session.handoffs.push({
    from: fromAgent,
    to: toAgent,
    timestamp: new Date().toISOString(),
    summary: summary.substring(0, 300),
    fullContent: fullContent.substring(0, 3000),
    wordCount: fullContent.split(' ').length,
    keyTopics: extractKeyTopics(fullContent),
    // Filled in by updateHandoffUsage once the TO agent completes
    usedPreviousContext: null,
  });

  if (data.sessions.length > 20) data.sessions = data.sessions.slice(-20);
  fs.writeFileSync(COMMS_FILE, JSON.stringify(data, null, 2));
  return session;
}

// Call this AFTER the receiving agent completes.
// fromAgent: the agent whose handoff we're measuring (e.g. 'alex')
// receiverOutput: the receiving agent's full output (e.g. Maya's output)
export function updateHandoffUsage(sessionId, fromAgent, receiverOutput) {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(COMMS_FILE, 'utf-8')); }
  catch { return; }

  const session = data.sessions.find(s => s.id === sessionId);
  if (!session) return;

  const handoff = session.handoffs.find(h => h.from === fromAgent);
  if (!handoff) return;

  handoff.usedPreviousContext = measureTopicPickup(handoff.keyTopics, receiverOutput);

  fs.writeFileSync(COMMS_FILE, JSON.stringify(data, null, 2));
}

export function completeSession(sessionId, status = 'complete') {
  ensureFile();
  let data;
  try { data = JSON.parse(fs.readFileSync(COMMS_FILE, 'utf-8')); }
  catch { data = { sessions: [] }; }
  const session = data.sessions.find(s => s.id === sessionId);
  if (session) {
    session.status = status;
    session.completedAt = new Date().toISOString();
    session.duration = session.startedAt
      ? Math.round((new Date() - new Date(session.startedAt)) / 1000) + 's'
      : 'unknown';
  }
  fs.writeFileSync(COMMS_FILE, JSON.stringify(data, null, 2));
}

export function getSessions() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(COMMS_FILE, 'utf-8'));
    return data.sessions.slice().reverse();
  } catch { return []; }
}

export function getSession(sessionId) {
  const sessions = getSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

export function getSessionByTopic(topic) {
  const sessions = getSessions();
  const lower = topic.toLowerCase();
  return sessions.find(s => s.topic && s.topic.toLowerCase().includes(lower)) || null;
}
