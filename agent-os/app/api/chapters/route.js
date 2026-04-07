import {
  startSession, closeSession, getProgressReport,
  getActiveSession, getAllChapters, getAllSessions,
  logAccomplishment, TEAM_MEMBERS
} from '../../../lib/chapters.js';
import { OLLAMA_URL } from '../../../lib/agents.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const memberId = searchParams.get('memberId');

  if (action === 'report') {
    const report = getProgressReport(memberId);

    // Generate AI summary of progress
    if (report.recentChapters.length > 0) {
      try {
        const chaptersText = report.recentChapters.slice(0, 5).map(c =>
          `Chapter ${c.number} by ${c.memberName} (${c.duration}): ${c.accomplishments.map(a => a.description).join(', ')}. Next steps: ${c.nextSteps || 'None noted'}`
        ).join('\n');

        const whileAwayText = report.chaptersWhileAway.length > 0
          ? report.chaptersWhileAway.map(c =>
              `${c.memberName} worked on: ${c.accomplishments.map(a => a.description).join(', ')}`
            ).join('\n')
          : 'Nothing happened while you were away.';

        const prompt = `You are the OTG Icon progress briefing system. Generate a friendly professional progress report.

RECENT CHAPTERS:
${chaptersText}

WHAT HAPPENED WHILE ${memberId ? TEAM_MEMBERS[memberId]?.name || memberId : 'you'} WAS AWAY:
${whileAwayText}

Write a concise briefing (under 200 words) that:
1. Summarizes what was accomplished recently
2. Highlights what changed while they were away
3. States clearly what needs to happen next
4. Is warm and motivating in tone

Address them by name if provided.`;

        const res = await fetch(OLLAMA_URL + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'qwen2.5:14b',
            messages: [{ role: 'user', content: prompt }],
            stream: false,
            options: { temperature: 0.7, num_ctx: 4096, num_predict: 400 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          report.aiBriefing = data.message?.content || '';
        }
      } catch {}
    }

    return Response.json(report);
  }

  if (action === 'active') {
    return Response.json(getActiveSession());
  }

  if (action === 'chapters') {
    return Response.json(getAllChapters());
  }

  if (action === 'sessions') {
    return Response.json(getAllSessions());
  }

  if (action === 'team') {
    return Response.json(TEAM_MEMBERS);
  }

  return Response.json({ chapters: getAllChapters(), active: getActiveSession() });
}

export async function POST(request) {
  try {
    const { action, memberId, goals, notes, nextSteps, description, agentId } = await request.json();

    if (action === 'start') {
      if (!memberId) return Response.json({ error: 'Missing memberId' }, { status: 400 });
      const session = startSession(memberId, goals || '');
      return Response.json({ success: true, session });
    }

    if (action === 'close') {
      const chapter = closeSession(notes || '', nextSteps || '');
      return Response.json({ success: true, chapter });
    }

    if (action === 'log') {
      logAccomplishment(description || '', agentId || null);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}