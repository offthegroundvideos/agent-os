// Read models for the /os dashboard pages. Every query is a short read; the one write (tag correction)
// goes through the portfolio store exactly as /tag does.
import fs from 'node:fs';
import path from 'node:path';
import { DELIVERABLES, LANE_LABELS, LANES, STAGES, STYLES } from './gigs/constants.js';
import { parseTags } from './portfolio/index.js';
import { TAG_LANES } from './portfolio/tagger.js';
import { pacificDayStart, pacificParts, utcDayStart, utcMonthStart } from './time.js';

const WORKER_SILENT_MS = 15 * 60_000; // the spec's Healthchecks alert window
const LOG_TAIL_BYTES = 16_384;

// The last line of the worker's log for today's UTC date (or yesterday's, just after midnight UTC).
export function latestWorkerLine(logDir, now = new Date()) {
  for (const date of [now, new Date(now.getTime() - 86_400_000)]) {
    const file = path.join(logDir, `otg-os-worker-${date.toISOString().slice(0, 10)}.log`);
    let text;
    try {
      const handle = fs.openSync(file, 'r');
      try {
        const { size } = fs.fstatSync(handle);
        const length = Math.min(size, LOG_TAIL_BYTES);
        const buffer = Buffer.alloc(length);
        fs.readSync(handle, buffer, 0, length, size - length);
        text = buffer.toString('utf8');
      } finally {
        fs.closeSync(handle);
      }
    } catch {
      continue;
    }
    const line = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1);
    if (!line) continue;
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\S+Z)\s+(.*)$/);
    return { at: match ? match[1] : null, message: match ? match[2] : line, file: path.basename(file) };
  }
  return null;
}

function nextBundleHour(hours, date) {
  const { hour } = pacificParts(date);
  const sorted = [...hours].sort((a, b) => a - b);
  return sorted.find((h) => h > hour) ?? sorted[0] ?? null;
}

export function createDashboard({
  osDb, settings, ledger, budget, approvals, gigStore, stages, portfolio, team = null, logDir, now = () => new Date(),
}) {
  const { db } = osDb;
  const scalar = (sql, ...args) => db.prepare(sql).get(...args).n;

  function today() {
    const date = now();
    const dayStart = pacificDayStart(date);
    const monthStart = utcMonthStart(date);
    const worker = latestWorkerLine(logDir, date);
    const heartbeatAt = settings.get('heartbeat.last_ping_at') || null;
    const alive = Boolean(heartbeatAt) && date.getTime() - Date.parse(heartbeatAt) < WORKER_SILENT_MS;

    const spend = budget.status();
    const byModel = db.prepare(`SELECT provider, model_or_tool AS model, COUNT(*) AS calls, COALESCE(SUM(cost_micros), 0) AS micros
      FROM spend WHERE created_at >= ? GROUP BY provider, model_or_tool ORDER BY micros DESC`).all(monthStart);
    const toolCaps = Object.entries(settings.get('budget.daily_tool_caps')).map(([tool, cap]) => ({ tool, cap, used: budget.toolUnitsToday(tool) }));

    const movedToday = (stage) => scalar('SELECT COUNT(*) AS n FROM stage_events WHERE to_stage = ? AND created_at >= ?', stage, dayStart);
    const emails = Object.fromEntries(db.prepare('SELECT mode, COUNT(*) AS n FROM email_sends WHERE created_at >= ? GROUP BY mode')
      .all(dayStart).map((row) => [row.mode, row.n]));
    const day = {
      since: dayStart,
      found: scalar('SELECT COUNT(*) AS n FROM opportunities WHERE created_at >= ?', dayStart),
      researched: movedToday('researched'),
      pitchesDrafted: scalar("SELECT COUNT(*) AS n FROM actions WHERE action_type = 'email.first_contact' AND created_at >= ?", dayStart),
      followUpsDrafted: scalar("SELECT COUNT(*) AS n FROM actions WHERE action_type = 'email.follow_up' AND created_at >= ?", dayStart),
      approved: scalar("SELECT COUNT(*) AS n FROM actions WHERE status NOT IN ('proposed', 'rejected') AND approved_by NOT IN ('', 'auto') AND updated_at >= ?", dayStart),
      rejected: scalar("SELECT COUNT(*) AS n FROM actions WHERE status = 'rejected' AND updated_at >= ?", dayStart),
      gmailDrafts: emails.draft ?? 0,
      emailsSent: emails.send ?? 0,
      replies: scalar('SELECT COUNT(*) AS n FROM inbound_messages WHERE opportunity_id IS NOT NULL AND created_at >= ?', dayStart),
      closed: scalar("SELECT COUNT(*) AS n FROM stage_events WHERE to_stage LIKE 'closed_%' AND created_at >= ?", dayStart),
    };
    const waiting = scalar("SELECT COUNT(*) AS n FROM actions WHERE status = 'proposed'");
    const failed = scalar("SELECT COUNT(*) AS n FROM actions WHERE status = 'failed'");

    const summary = [];
    if (settings.get('os.paused')) summary.push('OTG-OS is paused: nothing outgoing runs until you resume.');
    summary.push(day.found || day.researched
      ? `Found ${day.found} new prospect${day.found === 1 ? '' : 's'} and researched ${day.researched}.`
      : 'No new prospects found or researched yet today.');
    if (day.pitchesDrafted || day.followUpsDrafted) summary.push(`Drafted ${day.pitchesDrafted} pitch${day.pitchesDrafted === 1 ? '' : 'es'} and ${day.followUpsDrafted} follow-up${day.followUpsDrafted === 1 ? '' : 's'}.`);
    if (day.gmailDrafts || day.emailsSent) summary.push(`${day.gmailDrafts} Gmail draft${day.gmailDrafts === 1 ? '' : 's'} made, ${day.emailsSent} email${day.emailsSent === 1 ? '' : 's'} sent.`);
    if (day.replies) summary.push(`${day.replies} repl${day.replies === 1 ? 'y' : 'ies'} came in.`);
    summary.push(waiting ? `${waiting} approval${waiting === 1 ? ' is' : 's are'} waiting for you.` : 'Nothing is waiting for approval.');
    if (failed) summary.push(`${failed} action${failed === 1 ? '' : 's'} failed and need a look.`);

    const recent = db.prepare(`SELECT e.opportunity_id AS id, e.from_stage AS fromStage, e.to_stage AS toStage, e.reason, e.actor, e.created_at AS at,
        b.name AS business, o.lane FROM stage_events e JOIN opportunities o ON o.id = e.opportunity_id JOIN businesses b ON b.id = o.business_id
      ORDER BY e.id DESC LIMIT 8`).all();

    return {
      now: date.toISOString(),
      ownerName: team?.members().find((member) => member.role === 'owner')?.name ?? '',
      pacificHour: pacificParts(date).hour,
      paused: settings.get('os.paused'),
      mode: settings.get('outreach.mode'),
      pausedLanes: settings.get('outreach.paused_lanes'),
      goal: {
        target: settings.get('goals.monthly_shoot_days'),
        booked: scalar("SELECT COUNT(*) AS n FROM stage_events WHERE to_stage = 'booked' AND created_at >= ?", monthStart),
        monthStart,
      },
      spend: { ...spend, byModel, toolCaps, toolDay: utcDayStart(date) },
      worker: { line: worker, heartbeatAt, alive },
      day,
      waiting,
      failed,
      nextBundleHour: nextBundleHour(settings.get('telegram.bundle_hours'), date),
      summary,
      recent,
    };
  }

  function approvalItem(action) {
    const payload = action.payload ?? {};
    return {
      id: action.id,
      actionType: action.actionType,
      tool: action.tool,
      urgent: action.urgent,
      createdAt: action.createdAt,
      opportunityId: action.opportunityId,
      why: action.why,
      business: payload.business ?? '',
      to: payload.to ?? '',
      subject: payload.subject ?? '',
      draft: String(payload.draft ?? ''),
      edited: String(payload.draft ?? '') !== action.originalDraft,
      needsReview: Boolean(payload.needsReview),
      description: approvals.describe(action),
      inTelegram: action.telegramMessageId != null,
    };
  }

  // The same list /approvals shows: everything proposed, oldest first.
  function pendingApprovals() {
    return {
      items: ledger.list({ status: 'proposed', limit: 100 }).reverse().map(approvalItem),
      nextBundleHour: nextBundleHour(settings.get('telegram.bundle_hours'), now()),
    };
  }

  function pipeline() {
    const counts = {};
    for (const row of db.prepare('SELECT lane, stage, COUNT(*) AS n FROM opportunities GROUP BY lane, stage').all()) {
      counts[row.lane] = { ...(counts[row.lane] ?? {}), [row.stage]: row.n };
    }
    const opportunities = db.prepare(`SELECT o.id, o.lane, o.stage, o.angle, o.updated_at AS updatedAt, o.next_follow_up_at AS nextFollowUpAt,
        b.name AS business, b.location, b.website, c.name AS contactName, c.email AS contactEmail
      FROM opportunities o JOIN businesses b ON b.id = o.business_id LEFT JOIN contacts c ON c.id = o.contact_id
      ORDER BY o.updated_at DESC, o.rowid DESC LIMIT 500`).all();
    return {
      stages: STAGES, lanes: LANES, laneLabels: LANE_LABELS, counts, opportunities,
      pausedLanes: settings.get('outreach.paused_lanes'),
    };
  }

  function opportunity(id) {
    const opp = gigStore.getOpportunity(id);
    if (!opp) return null;
    const items = (ids) => ids.map((itemId) => portfolio.store.get(itemId)).filter(Boolean);
    const sent = db.prepare('SELECT portfolio_item_id AS itemId, action_id AS actionId, created_at AS at FROM portfolio_sends WHERE opportunity_id = ? ORDER BY id')
      .all(id).map((row) => ({ ...row, item: portfolio.store.get(row.itemId) }));
    const emails = db.prepare(`SELECT kind, to_email AS toEmail, mode, bounced, unsubscribed, created_at AS at FROM email_sends
      WHERE opportunity_id = ? ORDER BY id`).all(id);
    const actions = ledger.listForOpportunity(id).map((action) => ({
      id: action.id, actionType: action.actionType, status: action.status, why: action.why, autonomyLevel: action.autonomyLevel,
      subject: action.payload?.subject ?? '', draft: String(action.payload?.draft ?? ''), approvedBy: action.approvedBy,
      rejectReason: action.rejectReason, editRatio: action.editRatio, lastError: action.lastError, result: action.result,
      costMicros: action.costMicros, createdAt: action.createdAt, executedAt: action.executedAt,
    }));
    return {
      ...opp,
      laneLabel: LANE_LABELS[opp.lane] ?? opp.lane,
      events: stages.events(id).reverse(),
      portfolioMatches: items(opp.portfolioIds ?? []),
      portfolioSent: sent,
      emails,
      actions,
    };
  }

  function portfolioLibrary() {
    return {
      items: portfolio.store.list(),
      options: { lane: TAG_LANES, style: STYLES, type: DELIVERABLES },
    };
  }

  // The dashboard's tag correction: the same checks and the same confirmed save as /tag.
  function tagPortfolio(id, input) {
    const { tags, error } = parseTags(input);
    if (error) return { error };
    if (!Object.keys(tags).length) return { error: 'Change at least one tag.' };
    try {
      return { item: portfolio.store.setTags(Number(id), tags, { confirmed: true }) };
    } catch (error2) {
      return { error: error2.message };
    }
  }

  function settingsView(editor) {
    return {
      values: editor.values(),
      lanes: settings.get('gigs.lanes'),
      laneOrder: LANES,
      pausedLanes: settings.get('outreach.paused_lanes'),
      paused: settings.get('os.paused'),
      budget: {
        monthlyCapCents: settings.get('budget.monthly_cap_cents'),
        warningCents: settings.get('budget.warning_cents'),
        dailyToolCaps: settings.get('budget.daily_tool_caps'),
      },
      bundleHours: settings.get('telegram.bundle_hours'),
      team: team ? team.members().map((member) => ({ name: member.name, role: member.role })) : [],
    };
  }

  return { today, pendingApprovals, pipeline, opportunity, portfolioLibrary, tagPortfolio, settingsView };
}
