// The morning brief (spec section 7): once a day the brain looks at today, the pipeline and the worker log
// and writes a few lines on what happened, what needs Jack, and the one thing to do first.
import { pacificDateKey, pacificParts } from './time.js';

export const BRIEF_HOUR = 7; // Pacific, the end of Telegram quiet hours

export const BRIEF_PROMPT = [
  'Write my morning brief. Use the tools first: get_today, list_pending_approvals, list_pipeline (lane all, stage open) and get_worker_log.',
  'Then write 4 to 6 short lines in plain text, no markdown or bullets:',
  'what happened since yesterday, what needs me today (approvals waiting, replies or hot leads, anything failed),',
  'and end with "First:" and the single most valuable thing to do first. Use real names and numbers only from the tools.',
].join(' ');

export function createMorningBrief({ chat, settings, now = () => new Date(), taskType = 'console' }) {
  function latest() {
    return settings.get('brief.latest');
  }

  function isDue(date = now()) {
    return pacificParts(date).hour >= BRIEF_HOUR && settings.get('brief.last_date') !== pacificDateKey(date);
  }

  // Writes a new brief and keeps it for the dashboard. Marks the day first so a failure doesn't retry every tick.
  async function write(date = now()) {
    settings.set('brief.last_date', pacificDateKey(date));
    const { answer } = await chat.converse(BRIEF_PROMPT, { channel: 'telegram', taskType });
    const brief = { date: pacificDateKey(date), at: date.toISOString(), text: String(answer ?? '').trim() };
    settings.set('brief.latest', brief);
    return brief;
  }

  return { latest, isDue, write };
}
