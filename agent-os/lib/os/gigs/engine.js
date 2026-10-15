// lib/os/gigs/engine.js
import { pacificDateKey, pacificParts } from '../time.js';
import { LANES, OPEN_STAGES } from './constants.js';
import { pitchKey } from './outreach.js';

const REPLY_POLL_MS = 5 * 60_000;
const MAX_PITCHES_PER_TICK = 3;
const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
const words = (text) => text.replaceAll('_', ' ');

export function createGigEngine({
  settings, store, stages, portfolio, finder = null, research, outreach, triage = null, gmail = null,
  canEmail = false, now = () => new Date(), log = console.error,
}) {
  const lastRuns = () => settings.get('gigs.last_runs');
  const ranToday = (job, date) => lastRuns()[job] === pacificDateKey(date);
  const markRan = (job, date) => settings.set('gigs.last_runs', { ...lastRuns(), [job]: pacificDateKey(date) });

  function isWeekday(date) {
    const day = new Date(`${pacificDateKey(date)}T12:00:00Z`).getUTCDay();
    return day >= 1 && day <= 5;
  }

  async function dailyPortfolio(date) {
    if (ranToday('portfolio', date) || pacificParts(date).hour < 6) return null;
    markRan('portfolio', date);
    return portfolio.importAll();
  }

  async function dailyProspecting(date) {
    if (!finder || ranToday('prospecting', date) || pacificParts(date).hour < 7 || !isWeekday(date)) return null;
    markRan('prospecting', date);
    const lanes = LANES.filter((lane) => settings.get('gigs.lanes')[lane]?.active);
    if (!lanes.length) return null;
    // Rotate which lanes get the day's searches so every lane is covered across the week.
    const dayNumber = Math.floor(Date.parse(`${pacificDateKey(date)}T00:00:00Z`) / 86_400_000);
    const results = [];
    for (let i = 0; i < settings.get('gigs.daily_searches'); i += 1) {
      results.push(await finder.findForLane(lanes[(dayNumber + i) % lanes.length]));
    }
    return results;
  }

  async function researchQueue(date) {
    const today = pacificDateKey(date);
    const counter = settings.get('gigs.research_today');
    let count = counter.date === today ? counter.count : 0;
    const results = [];
    for (const opp of store.listOpportunities({ stage: 'found', limit: 2 })) {
      if (count >= settings.get('gigs.daily_research')) break;
      count += 1;
      settings.set('gigs.research_today', { date: today, count });
      results.push({ id: opp.id, ...(await research.research(opp.id)) });
    }
    return results.length ? results : null;
  }

  async function draftPitches(date) {
    if (!canEmail) return null;
    const since = new Date(date.getTime() - 86_400_000).toISOString();
    let room = settings.get('outreach.daily_pitch_limit') - store.actionsSince('email.first_contact', since);
    let drafted = 0;
    const results = [];
    for (const opp of store.listOpportunities({ stage: 'researched', limit: 20 })) {
      const existing = store.actionByKey(pitchKey(opp));
      if (existing?.status === 'rejected') {
        stages.move(opp.id, 'closed_lost', { reason: `pitch rejected (${existing.rejectReason || 'no reason'})`, patch: { close_reason: 'pitch_rejected' } });
        results.push({ id: opp.id, closed: 'pitch_rejected' });
        continue;
      }
      if (existing || room <= 0 || drafted >= MAX_PITCHES_PER_TICK) continue;
      const result = await outreach.draftPitch(opp.id);
      if (result.actionId) {
        room -= 1;
        drafted += 1;
      }
      results.push({ id: opp.id, ...result });
    }
    return results.length ? results : null;
  }

  async function followUps(date) {
    if (!canEmail) return null;
    const days = settings.get('outreach.follow_up_days');
    const results = [];
    for (const opp of store.dueFollowUps(date.toISOString())) {
      if (opp.followUpsSent >= days.length) {
        stages.move(opp.id, 'closed_lost', { reason: 'no reply after the follow-ups', patch: { next_follow_up_at: null, close_reason: 'no_reply' } });
        results.push({ id: opp.id, closed: 'no_reply' });
        continue;
      }
      let inReplyTo = opp.lastMessageIdHeader;
      if (gmail && opp.gmailThreadId) {
        // In draft mode the first email is a Gmail draft until Jack sends it; don't follow up on an unsent draft.
        const sent = (await gmail.thread(opp.gmailThreadId)).messages.filter((message) => message.labelIds.includes('SENT'));
        if (!sent.length) {
          stages.update(opp.id, { next_follow_up_at: addDays(date, 1).toISOString() });
          results.push({ id: opp.id, waiting: 'the first email is still a draft' });
          continue;
        }
        inReplyTo = sent.at(-1).messageIdHeader || inReplyTo;
      }
      results.push({ id: opp.id, ...(await outreach.draftFollowUp(opp.id, { inReplyTo })) });
      stages.update(opp.id, { next_follow_up_at: null });
    }
    return results.length ? results : null;
  }

  async function checkIns(date) {
    const reopened = [];
    for (const opp of store.dueCheckIns(date.toISOString())) {
      stages.move(opp.id, 'researched', { reason: 'check-in date reached', patch: { check_in_at: null, close_reason: '' } });
      reopened.push(opp.id);
    }
    return reopened.length ? reopened : null;
  }

  async function pollReplies(date) {
    if (!triage) return null;
    const last = settings.get('gmail.last_poll_at');
    if (last && date.getTime() - Date.parse(last) < REPLY_POLL_MS) return null;
    settings.set('gmail.last_poll_at', date.toISOString());
    const result = await triage.poll();
    return result.handled ? result : null;
  }

  const JOBS = [
    ['portfolio', dailyPortfolio], ['prospecting', dailyProspecting], ['research', researchQueue], ['pitches', draftPitches],
    ['followUps', followUps], ['checkIns', checkIns], ['replies', pollReplies],
  ];

  async function tick() {
    if (settings.get('os.paused')) return { paused: true };
    const date = now();
    const report = {};
    for (const [name, job] of JOBS) {
      try {
        const result = await job(date);
        if (result != null) report[name] = result;
      } catch (error) {
        log(`gigs ${name} failed: ${error.message}`);
      }
    }
    return report;
  }

  // One pass by hand, for the live check (scripts/otg-os-gigs-once.mjs).
  async function runOnce({ lane }) {
    const report = { portfolio: await portfolio.importAll() };
    report.prospects = finder ? await finder.findForLane(lane) : { skipped: 'XAI_API_KEY is not set' };
    report.research = [];
    for (const opp of store.listOpportunities({ stage: 'found', limit: 5 })) {
      report.research.push({ name: opp.business.name, ...(await research.research(opp.id)) });
    }
    report.pitches = await draftPitches(now());
    return report;
  }

  function pipelineText() {
    const counts = store.stageCounts();
    const open = OPEN_STAGES.filter((stage) => counts[stage]).map((stage) => `${words(stage)}: ${counts[stage]}`);
    const closed = Object.entries(counts).filter(([stage]) => stage.startsWith('closed_')).reduce((sum, [, n]) => sum + n, 0);
    const paused = Object.entries(settings.get('outreach.paused_lanes'));
    const latest = store.listOpportunities({ limit: 5 }).map((opp) => `• ${opp.business.name} (${words(opp.lane)}) — ${words(opp.stage)}`);
    return [
      `Pipeline · ${settings.get('outreach.mode') === 'send' ? 'approved emails send on their own' : 'approved emails become Gmail drafts'}`,
      open.length ? open.join(' · ') : 'Nothing open yet.',
      `Closed: ${closed}`,
      ...(paused.length ? [`Paused: ${paused.map(([lane, why]) => `${lane} (${why})`).join(', ')}`] : []),
      ...(latest.length ? ['Latest:', ...latest] : []),
    ].join('\n');
  }

  function setLanePaused(lane, reason) {
    if (!LANES.includes(lane)) return `Lanes are: ${LANES.join(', ')}`;
    const paused = { ...settings.get('outreach.paused_lanes') };
    if (reason) paused[lane] = reason;
    else delete paused[lane];
    settings.set('outreach.paused_lanes', paused);
    return reason ? `Paused ${lane} outreach.` : `Resumed ${lane} outreach.`;
  }

  return {
    tick, runOnce, pipelineText, setLanePaused,
    portfolioText: () => portfolio.text(),
    tagPortfolio: (args) => portfolio.tag(args),
  };
}
