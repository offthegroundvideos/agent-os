import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  {
    id: 1,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE actions (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        action_type TEXT NOT NULL,
        tool TEXT NOT NULL,
        opportunity_id TEXT,
        payload TEXT NOT NULL,
        original_draft TEXT NOT NULL DEFAULT '',
        why TEXT NOT NULL,
        autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('ask', 'tell', 'silent')),
        status TEXT NOT NULL CHECK (status IN ('proposed', 'approved', 'rejected', 'executing', 'done', 'failed')),
        urgent INTEGER NOT NULL DEFAULT 0,
        approved_by TEXT NOT NULL DEFAULT '',
        reject_reason TEXT NOT NULL DEFAULT '',
        edit_ratio REAL,
        cost_micros INTEGER NOT NULL DEFAULT 0,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT NOT NULL DEFAULT '',
        result TEXT,
        outcome TEXT,
        telegram_message_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        executed_at TEXT
      );
      CREATE INDEX actions_by_status ON actions (status, next_attempt_at);
      CREATE TABLE autonomy_policies (
        action_type TEXT PRIMARY KEY,
        level TEXT NOT NULL CHECK (level IN ('ask', 'tell', 'silent', 'never')),
        ceiling TEXT NOT NULL CHECK (ceiling IN ('ask', 'tell', 'silent', 'never')),
        consecutive_clean_approvals INTEGER NOT NULL DEFAULT 0,
        consecutive_rejections INTEGER NOT NULL DEFAULT 0,
        promotion_offered_at TEXT,
        last_demotion_reason TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL
      );
      CREATE TABLE spend (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_or_tool TEXT NOT NULL,
        task_type TEXT NOT NULL,
        tokens_in INTEGER NOT NULL DEFAULT 0,
        tokens_out INTEGER NOT NULL DEFAULT 0,
        units INTEGER NOT NULL DEFAULT 0,
        cost_micros INTEGER NOT NULL DEFAULT 0,
        action_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX spend_by_time ON spend (created_at);
    `,
  },
  {
    // Each approval goes to every team member, so one action can have several Telegram copies.
    id: 2,
    sql: `
      CREATE TABLE telegram_messages (
        action_id TEXT NOT NULL REFERENCES actions (id),
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        PRIMARY KEY (action_id, chat_id, message_id)
      );
    `,
  },
  {
    // Gig Engine (outreach half) and portfolio library.
    id: 3,
    sql: `
      CREATE TABLE businesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lane TEXT NOT NULL CHECK (lane IN ('travel', 'winery', 'wedding', 'real_estate')),
        website TEXT NOT NULL,
        website_domain TEXT NOT NULL UNIQUE,
        location TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
        source_url TEXT NOT NULL DEFAULT '',
        fit_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses (id),
        name TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        email_source_url TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (business_id, email)
      );
      CREATE TABLE opportunities (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses (id),
        contact_id TEXT REFERENCES contacts (id),
        lane TEXT NOT NULL,
        stage TEXT NOT NULL,
        angle TEXT NOT NULL DEFAULT '',
        evidence TEXT NOT NULL DEFAULT '[]',
        style TEXT NOT NULL DEFAULT '',
        portfolio_ids TEXT NOT NULL DEFAULT '[]',
        gmail_thread_id TEXT,
        last_message_id_header TEXT NOT NULL DEFAULT '',
        subject TEXT NOT NULL DEFAULT '',
        pitched_at TEXT,
        follow_ups_sent INTEGER NOT NULL DEFAULT 0,
        next_follow_up_at TEXT,
        check_in_at TEXT,
        close_reason TEXT NOT NULL DEFAULT '',
        attributed_to_otg_os INTEGER NOT NULL DEFAULT 1,
        version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX opportunities_by_stage ON opportunities (stage, next_follow_up_at);
      CREATE INDEX opportunities_by_thread ON opportunities (gmail_thread_id);
      CREATE TABLE stage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id TEXT NOT NULL REFERENCES opportunities (id),
        from_stage TEXT NOT NULL,
        to_stage TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE suppression (
        value TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE email_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id TEXT NOT NULL REFERENCES opportunities (id),
        action_id TEXT NOT NULL,
        lane TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('pitch', 'follow_up', 'portfolio')),
        to_email TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('draft', 'send')),
        gmail_message_id TEXT NOT NULL DEFAULT '',
        gmail_thread_id TEXT NOT NULL DEFAULT '',
        bounced INTEGER NOT NULL DEFAULT 0,
        unsubscribed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX email_sends_by_time ON email_sends (created_at);
      CREATE TABLE inbound_messages (
        gmail_message_id TEXT PRIMARY KEY,
        opportunity_id TEXT,
        label TEXT NOT NULL,
        confidence REAL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE portfolio_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL CHECK (source IN ('site', 'instagram', 'manual')),
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        thumbnail_url TEXT NOT NULL DEFAULT '',
        lane TEXT NOT NULL DEFAULT '',
        style TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        deliverable_type TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        tags_confirmed INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE portfolio_sends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opportunity_id TEXT NOT NULL REFERENCES opportunities (id),
        portfolio_item_id INTEGER NOT NULL REFERENCES portfolio_items (id),
        action_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `,
  },
];

export function openOsDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  for (const migration of MIGRATIONS) {
    transaction(() => {
      if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migration.id)) return;
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migration.id, new Date().toISOString());
    });
  }

  return { db, transaction, close: () => db.close() };
}
