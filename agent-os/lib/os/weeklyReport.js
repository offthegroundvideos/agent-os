// The weekly money report: what the last 7 days produced, compared with the 7 before, and what it cost.
import { formatDollars } from './budget.js';
import { LANE_LABELS, LANES } from './gigs/constants.js';
import { pacificDateKey, pacificParts } from './time.js';

const DAY_MS = 86_400_000;
export const WEEKLY_REPORT_HOUR = 18; // Sunday 6pm Pacific

export function createWeeklyReport({ osDb, settings, now = () => new Date() }) {
  const { db } = osDb;
  const scalar = (sql, ...args) => db.prepare(sql).get(...args).n;

  function window(from, to) {
    const moved = (stage) => scalar('SELECT COUNT(*) AS n FROM stage_events WHERE to_stage = ? AND created_at >= ? AND created_at < ?', stage, from, to);
    const emails = Object.fromEntries(db.prepare('SELECT mode, COUNT(*) AS n FROM email_sends WHERE created_at >= ? AND created_at < ? GROUP BY mode')
      .all(from, to).map((row) => [row.mode, row.n]));
    return {
      found: scalar('SELECT COUNT(*) AS n FROM opportunities WHERE created_at >= ? AND created_at < ?', from, to),
      researched: moved('researched'),
      pitched: moved('pitched'),
      replied: moved('replied'),
      booked: moved('booked'),
      pitchesDrafted: scalar("SELECT COUNT(*) AS n FROM actions WHERE action_type = 'email.first_contact' AND created_at >= ? AND created_at < ?", from, to),
      approved: scalar(`SELECT COUNT(*) AS n FROM actions WHERE approved_by NOT IN ('', 'auto') AND status IN ('approved', 'executing', 'done', 'failed')
        AND updated_at >= ? AND updated_at < ?`, from, to),
      rejected: scalar("SELECT COUNT(*) AS n FROM actions WHERE status = 'rejected' AND updated_at >= ? AND updated_at < ?", from, to),
      gmailDrafts: emails.draft ?? 0,
      emailsSent: emails.send ?? 0,
      spendMicros: scalar('SELECT COALESCE(SUM(cost_micros), 0) AS n FROM spend WHERE created_at >= ? AND created_at < ?', from, to),
    };
  }

  function build(date = now()) {
    const to = date.toISOString();
    const from = new Date(date.getTime() - 7 * DAY_MS).toISOString();
    const before = new Date(date.getTime() - 14 * DAY_MS).toISOString();
    const week = window(from, to);
    const previous = window(before, from);

    const lanes = LANES.map((lane) => ({
      lane,
      label: LANE_LABELS[lane],
      found: scalar(`SELECT COUNT(*) AS n FROM opportunities WHERE lane = ? AND created_at >= ? AND created_at < ?`, lane, from, to),
      pitched: scalar(`SELECT COUNT(*) AS n FROM stage_events e JOIN opportunities o ON o.id = e.opportunity_id
        WHERE o.lane = ? AND e.to_stage = 'pitched' AND e.created_at >= ? AND e.created_at < ?`, lane, from, to),
      replied: scalar(`SELECT COUNT(*) AS n FROM stage_events e JOIN opportunities o ON o.id = e.opportunity_id
        WHERE o.lane = ? AND e.to_stage = 'replied' AND e.created_at >= ? AND e.created_at < ?`, lane, from, to),
      open: scalar("SELECT COUNT(*) AS n FROM opportunities WHERE lane = ? AND stage NOT LIKE 'closed_%' AND stage != 'booked'", lane),
    }));
    const closed = db.prepare(`SELECT to_stage AS stage, COUNT(*) AS n FROM stage_events WHERE to_stage LIKE 'closed_%'
      AND created_at >= ? AND created_at < ? GROUP BY to_stage ORDER BY n DESC`).all(from, to).map((row) => ({ stage: row.stage, count: row.n }));
    const spendByModel = db.prepare(`SELECT model_or_tool AS model, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS micros FROM spend
      WHERE created_at >= ? AND created_at < ? GROUP BY model_or_tool ORDER BY micros DESC`).all(from, to).map((row) => ({ ...row }));
    const hot = db.prepare(`SELECT o.id, o.stage, o.lane, b.name AS business FROM opportunities o JOIN businesses b ON b.id = o.business_id
      WHERE o.stage IN ('replied', 'portfolio_sent', 'quoted', 'held') ORDER BY o.updated_at DESC LIMIT 8`).all().map((row) => ({ ...row }));
    const waiting = scalar("SELECT COUNT(*) AS n FROM actions WHERE status = 'proposed'");

    const decided = week.approved + week.rejected;
    const metrics = {
      costPerPitchMicros: week.pitchesDrafted ? Math.round(week.spendMicros / week.pitchesDrafted) : null,
      replyRate: week.pitched ? week.replied / week.pitched : null,
      approvalRate: decided ? week.approved / decided : null,
    };

    const highlights = [];
    const change = (key, label) => {
      const diff = week[key] - previous[key];
      return diff === 0 ? `${week[key]} ${label} (same as last week)` : `${week[key]} ${label} (${diff > 0 ? '+' : ''}${diff} vs last week)`;
    };
    highlights.push(`${change('found', 'new prospects')}, ${week.researched} researched.`);
    highlights.push(`${change('pitchesDrafted', 'pitches drafted')}; ${week.approved} approved, ${week.rejected} rejected.`);
    highlights.push(`${week.gmailDrafts} Gmail drafts and ${week.emailsSent} emails sent; ${change('replied', 'replies')}.`);
    if (week.booked) highlights.push(`${week.booked} shoot${week.booked === 1 ? '' : 's'} booked.`);
    highlights.push(`Spent ${formatDollars(week.spendMicros)}${metrics.costPerPitchMicros != null ? `, about ${formatDollars(metrics.costPerPitchMicros)} per pitch` : ''}.`);
    const best = [...lanes].sort((a, b) => b.replied - a.replied || b.pitched - a.pitched)[0];
    if (best && (best.replied || best.pitched)) highlights.push(`Strongest lane: ${best.label} (${best.pitched} pitched, ${best.replied} replied).`);

    const nextSteps = [];
    if (waiting) nextSteps.push(`Clear the ${waiting} draft${waiting === 1 ? '' : 's'} waiting for approval; nothing goes out until you do.`);
    if (hot.length) nextSteps.push(`Answer ${hot.map((opp) => opp.business).slice(0, 3).join(', ')}${hot.length > 3 ? ' and others' : ''}; replies are where bookings come from.`);
    if (settings.get('outreach.mode') === 'draft' && week.gmailDrafts) nextSteps.push('Approved pitches are Gmail drafts: send them from Gmail, or switch to send mode in Settings.');
    if (!week.pitchesDrafted) nextSteps.push('No pitches were drafted this week: check the worker log and the research queue.');
    const goal = settings.get('goals.monthly_shoot_days');

    return { from, to, week, previous, lanes, closed, spendByModel, hot, waiting, metrics, highlights, nextSteps, goal };
  }

  function text(report) {
    const lines = [
      `📊 OTG-OS weekly report (${pacificDateKey(new Date(report.from))} to ${pacificDateKey(new Date(report.to))})`,
      '',
      ...report.highlights.map((line) => `• ${line}`),
    ];
    if (report.nextSteps.length) lines.push('', 'Next:', ...report.nextSteps.map((line) => `• ${line}`));
    lines.push('', 'Full report: /os/report on the dashboard.');
    return lines.join('\n');
  }

  // Sunday evening, once per week.
  function isDue(date = now()) {
    const day = new Date(`${pacificDateKey(date)}T12:00:00Z`).getUTCDay();
    return day === 0 && pacificParts(date).hour >= WEEKLY_REPORT_HOUR && settings.get('report.last_weekly') !== pacificDateKey(date);
  }

  function markSent(date = now()) {
    settings.set('report.last_weekly', pacificDateKey(date));
  }

  return { build, text, isDue, markSent };
}
