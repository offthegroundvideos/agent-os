// lib/os/gigs/store.js
import { randomUUID } from 'node:crypto';
import { LANES, SHARED_HOSTS } from './constants.js';

export class GigStoreError extends Error {}

export function domainOf(url) {
  try {
    const text = String(url ?? '').trim();
    if (!text || /\s/.test(text)) return '';
    const host = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase().replace(/\.$/, '');
    return host.includes('.') ? host.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

// Extracts the bare address from "Name <addr>" / "<addr>" forms; '' when it is not a usable address.
export function normalizeEmail(value) {
  const text = String(value ?? '');
  const angle = text.match(/<([^<>]*)>/);
  const clean = (angle ? angle[1] : text).trim().toLowerCase().replace(/\.$/, '');
  return /^[^@\s]+@[^@\s]+\.[^@\s.]+$/.test(clean) ? clean : '';
}

const normalizeWebsite = (website) => (/^https?:\/\//i.test(website) ? website : `https://${website}`);

export function isSharedHost(domain) {
  return SHARED_HOSTS.some((host) => domain === host || domain.endsWith(`.${host}`));
}

// Dedupe key for a business: its domain, or domain + page path on hosts many businesses share.
export function businessKey(website) {
  const domain = domainOf(website);
  if (!domain || !isSharedHost(domain)) return domain;
  const pathname = new URL(normalizeWebsite(String(website).trim())).pathname.replace(/\/+$/, '').toLowerCase();
  return `${domain}${pathname}`;
}

function toBusiness(row) {
  return row ? {
    id: row.id, name: row.name, lane: row.lane, website: row.website, websiteDomain: row.website_domain,
    location: row.location, timezone: row.timezone, sourceUrl: row.source_url, fitReason: row.fit_reason,
  } : null;
}

function toContact(row) {
  return row ? { id: row.id, businessId: row.business_id, name: row.name, role: row.role, email: row.email, emailSourceUrl: row.email_source_url } : null;
}

function toOpportunity(row) {
  return {
    id: row.id, businessId: row.business_id, contactId: row.contact_id, lane: row.lane, stage: row.stage,
    angle: row.angle, evidence: JSON.parse(row.evidence), style: row.style, portfolioIds: JSON.parse(row.portfolio_ids),
    gmailThreadId: row.gmail_thread_id, lastMessageIdHeader: row.last_message_id_header, subject: row.subject,
    pitchedAt: row.pitched_at, followUpsSent: row.follow_ups_sent, nextFollowUpAt: row.next_follow_up_at,
    checkInAt: row.check_in_at, closeReason: row.close_reason, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createGigStore({ db, transaction }, { now = () => new Date() } = {}) {
  const stamp = () => now().toISOString();

  function getBusiness(id) {
    return toBusiness(db.prepare('SELECT * FROM businesses WHERE id = ?').get(id));
  }

  function upsertBusiness({ name, lane, website, location = '', timezone = 'America/Los_Angeles', sourceUrl = '', fitReason = '' }) {
    if (!LANES.includes(lane)) throw new GigStoreError(`Unknown lane: ${lane}`);
    const domain = domainOf(website);
    if (!domain) throw new GigStoreError(`No usable website for ${name}.`);
    const key = businessKey(website);
    const existing = db.prepare('SELECT * FROM businesses WHERE website_key = ?').get(key);
    if (existing) return { business: toBusiness(existing), created: false };
    const id = `biz_${randomUUID()}`;
    db.prepare(`INSERT INTO businesses (id, name, lane, website, website_domain, website_key, location, timezone, source_url, fit_reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, String(name), lane, normalizeWebsite(String(website).trim()), domain, key, String(location), timezone, String(sourceUrl), String(fitReason), stamp());
    return { business: getBusiness(id), created: true };
  }

  function addContact(businessId, { name = '', role = '', email, emailSourceUrl }) {
    const clean = normalizeEmail(email);
    if (!clean) throw new GigStoreError(`Invalid contact email: ${email}`);
    db.prepare(`INSERT OR IGNORE INTO contacts (id, business_id, name, role, email, email_source_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(`ct_${randomUUID()}`, businessId, String(name ?? ''), String(role ?? ''), clean, String(emailSourceUrl ?? ''), stamp());
    return toContact(db.prepare('SELECT * FROM contacts WHERE business_id = ? AND email = ?').get(businessId, clean));
  }

  function getOpportunity(id) {
    const row = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id);
    if (!row) return null;
    const contact = row.contact_id ? toContact(db.prepare('SELECT * FROM contacts WHERE id = ?').get(row.contact_id)) : null;
    return { ...toOpportunity(row), business: getBusiness(row.business_id), contact };
  }

  const run = (fn) => (db.isTransaction ? fn() : transaction(fn));

  const many = (rows) => rows.map((row) => getOpportunity(row.id));

  // One opportunity per business, ever: a business we already contacted (or closed) is never re-found.
  function createOpportunity(businessId) {
    return run(() => {
      const existing = db.prepare('SELECT id FROM opportunities WHERE business_id = ? ORDER BY created_at DESC LIMIT 1').get(businessId);
      if (existing) return { opportunity: getOpportunity(existing.id), created: false };
      const business = getBusiness(businessId);
      if (!business) throw new GigStoreError(`Business not found: ${businessId}`);
      const id = `opp_${randomUUID()}`;
      const time = stamp();
      db.prepare(`INSERT INTO opportunities (id, business_id, lane, stage, created_at, updated_at) VALUES (?, ?, ?, 'found', ?, ?)`)
        .run(id, businessId, business.lane, time, time);
      db.prepare(`INSERT INTO stage_events (opportunity_id, from_stage, to_stage, reason, actor, created_at) VALUES (?, '', 'found', ?, 'otg-os', ?)`)
        .run(id, business.fitReason || 'found by prospect search', time);
      return { opportunity: getOpportunity(id), created: true };
    });
  }

  function listOpportunities({ stage = null, limit = 50 } = {}) {
    return many(stage
      ? db.prepare('SELECT id FROM opportunities WHERE stage = ? ORDER BY updated_at, rowid LIMIT ?').all(stage, limit)
      : db.prepare('SELECT id FROM opportunities ORDER BY updated_at DESC, rowid DESC LIMIT ?').all(limit));
  }

  function findByThread(threadId) {
    const thread = String(threadId ?? '').trim();
    if (!thread) return null;
    const row = db.prepare('SELECT id FROM opportunities WHERE gmail_thread_id = ? ORDER BY updated_at DESC LIMIT 1').get(thread);
    return row ? getOpportunity(row.id) : null;
  }

  function findByContactEmail(email) {
    const row = db.prepare(`SELECT o.id FROM opportunities o JOIN contacts c ON c.id = o.contact_id
      WHERE c.email = ? ORDER BY o.updated_at DESC LIMIT 1`).get(normalizeEmail(email));
    return row ? getOpportunity(row.id) : null;
  }

  function dueFollowUps(iso) {
    return many(db.prepare(`SELECT id FROM opportunities WHERE stage IN ('pitched', 'following_up')
      AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= ? ORDER BY next_follow_up_at LIMIT 20`).all(iso));
  }

  function dueCheckIns(iso) {
    return many(db.prepare(`SELECT id FROM opportunities WHERE stage = 'closed_not_now'
      AND check_in_at IS NOT NULL AND check_in_at <= ? ORDER BY check_in_at LIMIT 20`).all(iso));
  }

  function stageCounts() {
    return Object.fromEntries(db.prepare('SELECT stage, COUNT(*) AS n FROM opportunities GROUP BY stage').all().map((row) => [row.stage, row.n]));
  }

  function suppress(value, reason) {
    const text = String(value ?? '');
    const entry = text.includes('@') ? normalizeEmail(text) : text.trim().toLowerCase().replace(/\.$/, '');
    if (!entry) throw new GigStoreError(`Cannot suppress invalid email: ${value}`);
    db.prepare('INSERT OR IGNORE INTO suppression (value, reason, created_at) VALUES (?, ?, ?)').run(entry, String(reason), stamp());
  }

  // An address is blocked if it, or its whole domain, is on the list. Unparseable addresses fail closed.
  function isSuppressed(value) {
    const text = String(value ?? '');
    const clean = text.includes('@') ? normalizeEmail(text) : text.trim().toLowerCase().replace(/\.$/, '');
    if (text.includes('@') && !clean) return true;
    const domain = clean.includes('@') ? clean.split('@').pop() : clean;
    return Boolean(db.prepare('SELECT 1 FROM suppression WHERE value IN (?, ?)').get(clean, domain));
  }

  function recordEmailSend({ opportunityId, actionId, lane, kind, toEmail, mode, gmailMessageId = '', gmailThreadId = '' }) {
    db.prepare(`INSERT INTO email_sends (opportunity_id, action_id, lane, kind, to_email, mode, gmail_message_id, gmail_thread_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(opportunityId, actionId, lane, kind, String(toEmail).toLowerCase(), mode, String(gmailMessageId ?? ''), String(gmailThreadId ?? ''), stamp());
  }

  function emailsInLast24h({ kind = null } = {}) {
    const since = new Date(now().getTime() - 86_400_000).toISOString();
    const row = kind
      ? db.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE created_at >= ? AND kind = ?').get(since, kind)
      : db.prepare('SELECT COUNT(*) AS n FROM email_sends WHERE created_at >= ?').get(since);
    return row.n;
  }

  // Bounce and unsubscribe rates over the lane's last real sends (drafts can't bounce).
  function laneSendStats(lane, lastN = 50) {
    const row = db.prepare(`SELECT COUNT(*) AS sends, COALESCE(SUM(bounced), 0) AS bounces, COALESCE(SUM(unsubscribed), 0) AS unsubscribes
      FROM (SELECT bounced, unsubscribed FROM email_sends WHERE lane = ? AND mode = 'send' ORDER BY id DESC LIMIT ?)`).get(lane, lastN);
    return { sends: row.sends, bounces: row.bounces, unsubscribes: row.unsubscribes };
  }

  function markEmailOutcome(opportunityId, { bounced = false, unsubscribed = false } = {}) {
    db.prepare(`UPDATE email_sends SET bounced = MAX(bounced, ?), unsubscribed = MAX(unsubscribed, ?)
      WHERE id = (SELECT MAX(id) FROM email_sends WHERE opportunity_id = ? AND mode = 'send')`).run(bounced ? 1 : 0, unsubscribed ? 1 : 0, opportunityId);
  }

  function recordPortfolioSends(opportunityId, actionId, itemIds) {
    const insert = db.prepare('INSERT INTO portfolio_sends (opportunity_id, portfolio_item_id, action_id, created_at) VALUES (?, ?, ?, ?)');
    for (const itemId of itemIds) insert.run(opportunityId, itemId, actionId, stamp());
  }

  function seenInbound(gmailMessageId) {
    return Boolean(db.prepare('SELECT 1 FROM inbound_messages WHERE gmail_message_id = ?').get(gmailMessageId));
  }

  function recordInbound({ gmailMessageId, opportunityId = null, label, confidence = null }) {
    db.prepare('INSERT OR IGNORE INTO inbound_messages (gmail_message_id, opportunity_id, label, confidence, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(gmailMessageId, opportunityId, label, confidence, stamp());
  }

  function actionByKey(idempotencyKey) {
    const row = db.prepare('SELECT id, status, reject_reason FROM actions WHERE idempotency_key = ?').get(idempotencyKey);
    return row ? { id: row.id, status: row.status, rejectReason: row.reject_reason } : null;
  }

  function actionsSince(actionType, iso) {
    return db.prepare('SELECT COUNT(*) AS n FROM actions WHERE action_type = ? AND created_at >= ?').get(actionType, iso).n;
  }

  return {
    upsertBusiness, getBusiness, addContact, createOpportunity, getOpportunity, listOpportunities,
    findByThread, findByContactEmail, dueFollowUps, dueCheckIns, stageCounts,
    suppress, isSuppressed, recordEmailSend, emailsInLast24h, laneSendStats, markEmailOutcome,
    recordPortfolioSends, seenInbound, recordInbound, actionByKey, actionsSince,
  };
}
