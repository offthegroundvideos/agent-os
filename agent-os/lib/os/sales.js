// The sales layer on top of the Gig Engine: OTG-OS sets the discovery call, a person closes.
// Touch points, personal lead pages with clips, built-in booking against Google Calendar, closers and retainer deals.
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LANE_LABELS } from './gigs/constants.js';
import { normalizeEmail } from './gigs/store.js';
import { pacificDateKey, pacificParts, pacificToUtc } from './time.js';

export class SalesError extends Error {}

export const TOUCH_KINDS = {
  call: 'Phone call', text: 'Text', dm: 'Social DM', in_person: 'In person', email_manual: 'Email (by hand)', note: 'Note',
  page_viewed: 'Opened their page', video_played: 'Played the clip', call_booked: 'Booked a discovery call',
  call_held: 'Discovery call held', no_show: 'No-show', call_cancelled: 'Call cancelled', deal: 'Deal update',
};
export const MANUAL_KINDS = ['call', 'text', 'dm', 'in_person', 'email_manual', 'note'];
export const DEAL_STATUSES = ['open', 'proposal_sent', 'won', 'lost'];
export const OUTCOMES = ['held', 'no_show', 'cancelled'];

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v' };
const VIEW_GAP_MS = 30 * 60_000;
const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);

export function defaultIntro(name) {
  return `I made this page for the ${name} team: a few pieces of our work that fit what you do, and an easy way to grab 20 minutes with me to talk about what you have coming up.`;
}

export function createSales({
  osDb, settings, store, stages, portfolio, team = null, calendar = null, notifier = null,
  videoDir, now = () => new Date(), log = console.error,
}) {
  const { db, transaction } = osDb;
  const stamp = () => now().toISOString();
  const run = (fn) => (db.isTransaction ? fn() : transaction(fn));

  // ---- touch points ----

  function touch(opportunityId, { kind, channel = '', actor = '', note = '' }) {
    if (!TOUCH_KINDS[kind]) throw new SalesError(`Unknown touch point: ${kind}`);
    db.prepare('INSERT INTO touchpoints (opportunity_id, kind, channel, actor, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(opportunityId, kind, clip(channel, 40), clip(actor, 60), clip(note, 1000), stamp());
  }

  function logManual(opportunityId, { kind, note = '', actor = '' }) {
    if (!MANUAL_KINDS.includes(kind)) throw new SalesError(`Log one of: ${MANUAL_KINDS.join(', ')}`);
    if (!store.getOpportunity(opportunityId)) throw new SalesError('Prospect not found.');
    touch(opportunityId, { kind, channel: kind, actor, note });
  }

  // One timeline from everything OTG-OS already records plus the new touch points, newest first.
  function timeline(opportunityId, limit = 80) {
    const rows = [
      ...db.prepare('SELECT from_stage, to_stage, reason, actor, created_at FROM stage_events WHERE opportunity_id = ?').all(opportunityId)
        .map((row) => ({ at: row.created_at, kind: 'stage', label: `${row.from_stage || 'new'} → ${row.to_stage}`, note: row.reason, actor: row.actor })),
      ...db.prepare('SELECT kind, mode, to_email, created_at FROM email_sends WHERE opportunity_id = ?').all(opportunityId)
        .map((row) => ({ at: row.created_at, kind: 'email', label: `${row.kind.replaceAll('_', ' ')} ${row.mode === 'send' ? 'sent' : 'saved as Gmail draft'}`, note: row.to_email, actor: 'otg-os' })),
      ...db.prepare('SELECT label, created_at FROM inbound_messages WHERE opportunity_id = ?').all(opportunityId)
        .map((row) => ({ at: row.created_at, kind: 'reply', label: `Reply: ${row.label.replaceAll('_', ' ')}`, note: '', actor: 'prospect' })),
      ...db.prepare('SELECT action_type, status, approved_by, created_at FROM actions WHERE opportunity_id = ?').all(opportunityId)
        .map((row) => ({ at: row.created_at, kind: 'action', label: `${row.action_type} (${row.status})`, note: '', actor: row.approved_by || 'otg-os' })),
      ...db.prepare('SELECT kind, actor, note, created_at FROM touchpoints WHERE opportunity_id = ?').all(opportunityId)
        .map((row) => ({ at: row.created_at, kind: row.kind, label: TOUCH_KINDS[row.kind] ?? row.kind, note: row.note, actor: row.actor })),
    ];
    return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
  }

  // Touch counts per prospect for the pipeline list.
  function touchCounts() {
    const counts = {};
    const add = (sql) => {
      for (const row of db.prepare(sql).all()) counts[row.id] = (counts[row.id] ?? 0) + row.n;
    };
    add('SELECT opportunity_id AS id, COUNT(*) AS n FROM email_sends GROUP BY opportunity_id');
    add('SELECT opportunity_id AS id, COUNT(*) AS n FROM inbound_messages WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id');
    add('SELECT opportunity_id AS id, COUNT(*) AS n FROM touchpoints GROUP BY opportunity_id');
    return counts;
  }

  // ---- personal lead pages ----

  function publicBase() {
    return String(settings.get('public.base_url') ?? '').trim().replace(/\/+$/, '');
  }

  function publicUrl(token) {
    const base = publicBase();
    return base ? `${base}/p/${token}` : '';
  }

  // The line pitches end with: a link to the prospect's own page. Empty until the public address is set.
  function pitchPostscript(opportunityId) {
    if (!publicBase()) return '';
    const opp = store.getOpportunity(opportunityId);
    if (!opp) throw new SalesError('Prospect not found.');
    const url = publicUrl(ensurePage(opportunityId).token);
    return `P.S. I put together a short page for ${opp.business.name} with a few pieces that fit and an easy way to grab 20 minutes with me: ${url}`;
  }

  function pageFor(opportunityId) {
    return db.prepare('SELECT * FROM lead_pages WHERE opportunity_id = ?').get(opportunityId) ?? null;
  }

  function ensurePage(opportunityId) {
    return run(() => {
      const existing = pageFor(opportunityId);
      if (existing) return existing;
      const opp = store.getOpportunity(opportunityId);
      if (!opp) throw new SalesError('Prospect not found.');
      const token = randomBytes(18).toString('base64url');
      const time = stamp();
      db.prepare('INSERT INTO lead_pages (token, opportunity_id, intro, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(token, opportunityId, defaultIntro(opp.business.name), time, time);
      return pageFor(opportunityId);
    });
  }

  function updatePage(opportunityId, { intro, videoId, active } = {}) {
    const page = ensurePage(opportunityId);
    if (intro !== undefined) {
      const text = clip(intro, 1200);
      if (!text) throw new SalesError('The intro cannot be empty.');
      db.prepare('UPDATE lead_pages SET intro = ?, updated_at = ? WHERE token = ?').run(text, stamp(), page.token);
    }
    if (videoId !== undefined) {
      if (videoId !== null && getVideo(videoId)?.opportunity_id !== opportunityId) throw new SalesError('That clip belongs to another prospect.');
      db.prepare('UPDATE lead_pages SET video_id = ?, updated_at = ? WHERE token = ?').run(videoId, stamp(), page.token);
    }
    if (active !== undefined) db.prepare('UPDATE lead_pages SET active = ?, updated_at = ? WHERE token = ?').run(active ? 1 : 0, stamp(), page.token);
    return pageFor(opportunityId);
  }

  // Everything the public page shows. Nothing about other prospects, the ledger or OTG's notes.
  function publicPage(token) {
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token ?? ''))) return null;
    const page = db.prepare('SELECT * FROM lead_pages WHERE token = ? AND active = 1').get(token);
    if (!page) return null;
    const opp = store.getOpportunity(page.opportunity_id);
    if (!opp) return null;
    const pieces = (opp.portfolioIds ?? []).map((id) => portfolio.store.get(id)).filter(Boolean).slice(0, 3)
      .map((item) => ({ title: item.title, url: item.url, thumbnailUrl: item.thumbnailUrl, description: item.description }));
    const video = page.video_id ? getVideo(page.video_id) : null;
    return {
      token, business: opp.business.name, lane: LANE_LABELS[opp.lane] ?? opp.lane, intro: page.intro, pieces,
      video: video ? { id: video.id, mime: video.mime, title: video.title } : null,
      senderName: settings.get('outreach.sender_name'), opportunityId: opp.id,
    };
  }

  async function recordView(token) {
    const page = db.prepare('SELECT * FROM lead_pages WHERE token = ? AND active = 1').get(token);
    if (!page) return;
    const first = !page.last_viewed_at;
    const quiet = page.last_viewed_at && now().getTime() - Date.parse(page.last_viewed_at) < VIEW_GAP_MS;
    db.prepare('UPDATE lead_pages SET views = views + 1, last_viewed_at = ? WHERE token = ?').run(stamp(), token);
    if (quiet) return;
    touch(page.opportunity_id, { kind: 'page_viewed', channel: 'page' });
    if (first && notifier?.report) {
      const opp = store.getOpportunity(page.opportunity_id);
      try {
        await notifier.report(`👀 ${opp?.business.name ?? 'A prospect'} just opened their OTG page. (Email link scanners can trigger this too.)`);
      } catch (error) {
        log(`page view alert failed: ${error.message}`);
      }
    }
  }

  function recordPlay(token) {
    const page = db.prepare('SELECT * FROM lead_pages WHERE token = ? AND active = 1').get(token);
    if (!page) return false;
    const recent = db.prepare("SELECT created_at FROM touchpoints WHERE opportunity_id = ? AND kind = 'video_played' ORDER BY id DESC LIMIT 1").get(page.opportunity_id);
    if (recent && now().getTime() - Date.parse(recent.created_at) < VIEW_GAP_MS) return true;
    touch(page.opportunity_id, { kind: 'video_played', channel: 'page' });
    return true;
  }

  // ---- clips ----

  function getVideo(id) {
    return db.prepare('SELECT * FROM videos WHERE id = ?').get(Number(id)) ?? null;
  }

  function videoPath(video) {
    return path.join(videoDir, path.basename(video.file));
  }

  async function saveVideo(opportunityId, { bytes, mime, title = '' }) {
    if (!store.getOpportunity(opportunityId)) throw new SalesError('Prospect not found.');
    const ext = VIDEO_TYPES[mime];
    if (!ext) throw new SalesError('Upload an MP4, MOV or WebM video.');
    if (!bytes?.length) throw new SalesError('The video is empty.');
    if (bytes.length > MAX_VIDEO_BYTES) throw new SalesError('Keep clips under 250 MB (about 2 minutes from a phone).');
    fs.mkdirSync(videoDir, { recursive: true });
    const file = `${randomUUID()}.${ext}`;
    await fs.promises.writeFile(path.join(videoDir, file), bytes);
    const info = db.prepare('INSERT INTO videos (opportunity_id, title, file, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(opportunityId, clip(title, 120), file, mime, bytes.length, stamp());
    const id = Number(info.lastInsertRowid);
    updatePage(opportunityId, { videoId: id });
    return getVideo(id);
  }

  // The clip a public page may stream: only the one attached to that page.
  function pageVideo(token, id) {
    const page = db.prepare('SELECT * FROM lead_pages WHERE token = ? AND active = 1').get(token);
    if (!page || Number(page.video_id) !== Number(id)) return null;
    const video = getVideo(id);
    return video ? { ...video, path: videoPath(video) } : null;
  }

  // ---- booking ----

  function bookingRules() {
    return settings.get('sales.booking');
  }

  // Open discovery-call slots (UTC ISO starts), weekdays inside working hours, minus calendar busy time and other bookings.
  async function openSlots() {
    const rules = bookingRules();
    const date = now();
    const earliest = date.getTime() + rules.minNoticeHours * 3_600_000;
    const days = [];
    for (let i = 0; days.length < rules.days && i < rules.days * 2 + 7; i += 1) {
      const key = pacificDateKey(new Date(date.getTime() + i * 86_400_000));
      const weekday = new Date(`${key}T12:00:00Z`).getUTCDay();
      if (weekday >= 1 && weekday <= 5 && !days.includes(key)) days.push(key);
    }
    if (!days.length) return [];
    const windowStart = pacificToUtc(days[0], 0).toISOString();
    const windowEnd = pacificToUtc(days.at(-1), 23, 59).toISOString();
    let busy = [];
    if (calendar) {
      try {
        busy = await calendar.busy(windowStart, windowEnd);
      } catch (error) {
        log(`calendar busy check failed: ${error.message}`);
        busy = null;
      }
    }
    if (busy === null) return [];
    const booked = db.prepare("SELECT starts_at, ends_at FROM appointments WHERE status = 'booked' AND ends_at >= ?").all(windowStart)
      .map((row) => ({ start: row.starts_at, end: row.ends_at }));
    const blocks = [...busy, ...booked].map((block) => [Date.parse(block.start) - rules.bufferMinutes * 60_000, Date.parse(block.end) + rules.bufferMinutes * 60_000]);
    const slots = [];
    for (const key of days) {
      for (let minutes = rules.startHour * 60; minutes + rules.slotMinutes <= rules.endHour * 60; minutes += rules.stepMinutes) {
        const start = pacificToUtc(key, Math.floor(minutes / 60), minutes % 60).getTime();
        const end = start + rules.slotMinutes * 60_000;
        if (start < earliest) continue;
        if (blocks.some(([from, to]) => start < to && end > from)) continue;
        slots.push(new Date(start).toISOString());
      }
    }
    return slots;
  }

  function closers() {
    const listed = settings.get('sales.closers').map((name) => clip(name, 60)).filter(Boolean);
    if (listed.length) return listed;
    const owner = team?.members().find((member) => member.role === 'owner');
    return [owner?.name || settings.get('outreach.sender_name') || 'Jack'];
  }

  function nextCloser() {
    const list = closers();
    const turn = settings.get('sales.closer_turn') % list.length;
    settings.set('sales.closer_turn', turn + 1);
    return list[turn];
  }

  async function book(token, { start, name, email, note = '' }) {
    const page = publicPage(token);
    if (!page) throw new SalesError('This page is no longer available.');
    const guestName = clip(name, 80);
    const guestEmail = normalizeEmail(email);
    if (!guestName) throw new SalesError('Please add your name.');
    if (!guestEmail) throw new SalesError('Please add a valid email address.');
    const upcoming = db.prepare("SELECT starts_at FROM appointments WHERE opportunity_id = ? AND status = 'booked' AND starts_at >= ?").get(page.opportunityId, stamp());
    if (upcoming) throw new SalesError(`You already have a call booked for ${slotLabel(upcoming.starts_at)}. Reply to our email if you need to change it.`);
    const slots = await openSlots();
    const startMs = Date.parse(String(start ?? ''));
    const startIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : '';
    if (!slots.includes(startIso)) throw new SalesError('That time was just taken. Please pick another.');
    const endIso = new Date(Date.parse(startIso) + bookingRules().slotMinutes * 60_000).toISOString();
    const closer = nextCloser();
    let event = { id: '', link: '', meet: '' };
    if (calendar) {
      try {
        event = await calendar.createEvent({
          summary: `Discovery call: ${page.business} × OFF THE GROUND`,
          description: [
            `A ${bookingRules().slotMinutes}-minute intro call with ${closer} from OFF THE GROUND (madebyotg.com).`,
            note ? `From ${guestName}: ${clip(note, 500)}` : '',
          ].filter(Boolean).join('\n\n'),
          start: startIso,
          end: endIso,
          attendees: [{ email: guestEmail, displayName: guestName }],
        });
      } catch (error) {
        log(`calendar event failed: ${error.message}`);
      }
    }
    const id = `apt_${randomUUID()}`;
    run(() => {
      const time = stamp();
      db.prepare(`INSERT INTO appointments (id, opportunity_id, kind, starts_at, ends_at, status, closer, guest_name, guest_email, guest_note, calendar_event_id, created_at, updated_at)
        VALUES (?, ?, 'discovery', ?, ?, 'booked', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, page.opportunityId, startIso, endIso, closer, guestName, guestEmail, clip(note, 500), event.id, time, time);
      touch(page.opportunityId, { kind: 'call_booked', channel: 'page', actor: guestName, note: `${slotLabel(startIso)} with ${closer}` });
      db.prepare(`INSERT INTO deals (opportunity_id, closer, status, created_at, updated_at) VALUES (?, ?, 'open', ?, ?)
        ON CONFLICT (opportunity_id) DO UPDATE SET closer = excluded.closer, updated_at = excluded.updated_at`).run(page.opportunityId, closer, time, time);
      const opp = store.getOpportunity(page.opportunityId);
      if (['pitched', 'following_up'].includes(opp.stage)) {
        stages.move(opp.id, 'replied', { reason: 'booked a discovery call from their page', actor: 'prospect', patch: { next_follow_up_at: null } });
      }
    });
    if (notifier?.report) {
      try {
        await notifier.report([
          `📅 Discovery call booked: ${page.business}`,
          `${slotLabel(startIso)} · closer: ${closer}`,
          `${guestName} <${guestEmail}>${note ? `\n“${clip(note, 300)}”` : ''}`,
          event.id ? 'It is on the calendar with a Meet link.' : '⚠️ It could not be added to Google Calendar; add it by hand.',
        ].join('\n'));
      } catch (error) {
        log(`booking alert failed: ${error.message}`);
      }
    }
    return { id, startsAt: startIso, endsAt: endIso, closer, meet: event.meet, onCalendar: Boolean(event.id), label: slotLabel(startIso) };
  }

  function slotLabel(iso) {
    return `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))} PT`;
  }

  // ---- calls and deals ----

  function calls({ upcomingOnly = false } = {}) {
    const rows = db.prepare(`SELECT a.*, b.name AS business, o.lane, o.stage, (SELECT COUNT(*) FROM dossiers d WHERE d.opportunity_id = a.opportunity_id) AS has_brief
      FROM appointments a JOIN opportunities o ON o.id = a.opportunity_id JOIN businesses b ON b.id = o.business_id
      ${upcomingOnly ? "WHERE a.status = 'booked' AND a.ends_at >= ?" : ''} ORDER BY a.starts_at DESC LIMIT 100`)
      .all(...(upcomingOnly ? [stamp()] : []));
    return rows.map((row) => ({
      id: row.id, opportunityId: row.opportunity_id, business: row.business, lane: row.lane, stage: row.stage, kind: row.kind,
      startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, closer: row.closer, guestName: row.guest_name,
      guestEmail: row.guest_email, guestNote: row.guest_note, notes: row.notes, onCalendar: Boolean(row.calendar_event_id),
      hasBrief: row.has_brief > 0, label: slotLabel(row.starts_at),
    }));
  }

  async function setOutcome(appointmentId, { status, notes = '', actor = '' }) {
    if (!OUTCOMES.includes(status)) throw new SalesError(`Outcome must be one of: ${OUTCOMES.join(', ')}`);
    const row = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
    if (!row) throw new SalesError('Call not found.');
    db.prepare('UPDATE appointments SET status = ?, notes = ?, updated_at = ? WHERE id = ?').run(status, clip(notes, 2000), stamp(), appointmentId);
    touch(row.opportunity_id, { kind: status === 'held' ? 'call_held' : status === 'no_show' ? 'no_show' : 'call_cancelled', actor, note: clip(notes, 1000) });
    if (status === 'cancelled' && calendar && row.calendar_event_id) {
      try {
        await calendar.cancelEvent(row.calendar_event_id);
      } catch (error) {
        log(`calendar cancel failed: ${error.message}`);
      }
    }
    return calls().find((call) => call.id === appointmentId);
  }

  function deal(opportunityId) {
    const row = db.prepare('SELECT * FROM deals WHERE opportunity_id = ?').get(opportunityId);
    return row ? { closer: row.closer, offer: row.offer, monthlyCents: row.monthly_cents, status: row.status, notes: row.notes, updatedAt: row.updated_at } : null;
  }

  function setDeal(opportunityId, { status, monthlyCents, notes, closer }, { actor = '' } = {}) {
    if (!store.getOpportunity(opportunityId)) throw new SalesError('Prospect not found.');
    if (status !== undefined && !DEAL_STATUSES.includes(status)) throw new SalesError(`Deal status must be one of: ${DEAL_STATUSES.join(', ')}`);
    const cents = monthlyCents === undefined ? undefined : Math.round(Number(monthlyCents));
    if (cents !== undefined && (!Number.isFinite(cents) || cents < 0 || cents > 100_000_000)) throw new SalesError('Monthly value must be a dollar amount.');
    const current = deal(opportunityId);
    const next = {
      status: status ?? current?.status ?? 'open',
      monthlyCents: cents ?? current?.monthlyCents ?? 0,
      notes: notes === undefined ? current?.notes ?? '' : clip(notes, 2000),
      closer: closer === undefined ? current?.closer ?? closers()[0] : clip(closer, 60),
    };
    const time = stamp();
    db.prepare(`INSERT INTO deals (opportunity_id, closer, offer, monthly_cents, status, notes, created_at, updated_at) VALUES (?, ?, 'retainer', ?, ?, ?, ?, ?)
      ON CONFLICT (opportunity_id) DO UPDATE SET closer = excluded.closer, monthly_cents = excluded.monthly_cents, status = excluded.status,
        notes = excluded.notes, updated_at = excluded.updated_at`).run(opportunityId, next.closer, next.monthlyCents, next.status, next.notes, time, time);
    touch(opportunityId, { kind: 'deal', actor, note: `${next.status.replace('_', ' ')} · $${(next.monthlyCents / 100).toFixed(0)}/mo` });
    return deal(opportunityId);
  }

  // Sales numbers for Today, the report and the brain.
  function summary(sinceIso) {
    const one = (sql, ...args) => db.prepare(sql).get(...args).n;
    return {
      upcomingCalls: one("SELECT COUNT(*) AS n FROM appointments WHERE status = 'booked' AND ends_at >= ?", stamp()),
      callsBooked: one('SELECT COUNT(*) AS n FROM appointments WHERE created_at >= ?', sinceIso),
      callsHeld: one("SELECT COUNT(*) AS n FROM appointments WHERE status = 'held' AND updated_at >= ?", sinceIso),
      noShows: one("SELECT COUNT(*) AS n FROM appointments WHERE status = 'no_show' AND updated_at >= ?", sinceIso),
      pageViews: one("SELECT COUNT(*) AS n FROM touchpoints WHERE kind = 'page_viewed' AND created_at >= ?", sinceIso),
      proposalsOut: one("SELECT COUNT(*) AS n FROM deals WHERE status = 'proposal_sent'"),
      proposedMonthlyCents: one("SELECT COALESCE(SUM(monthly_cents), 0) AS n FROM deals WHERE status = 'proposal_sent'"),
      wonMonthlyCents: one("SELECT COALESCE(SUM(monthly_cents), 0) AS n FROM deals WHERE status = 'won'"),
      wonDeals: one("SELECT COUNT(*) AS n FROM deals WHERE status = 'won'"),
    };
  }

  return {
    touch, logManual, timeline, touchCounts,
    publicBase, publicUrl, pitchPostscript, pageFor, ensurePage, updatePage, publicPage, recordView, recordPlay,
    getVideo, saveVideo, pageVideo,
    openSlots, slotLabel, closers, book, calls, setOutcome, deal, setDeal, summary,
  };
}
