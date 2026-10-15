# OTG-OS — Handoff to Codex (2026-10-15)

Read first: `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md` (core spec),
`docs/superpowers/specs/2026-10-15-otg-os-sales-process-design.md` (sales), and
`docs/superpowers/plans/2026-10-15-otg-os-dashboard-v1-handoff.md` (what the dashboard rounds built).

## Where the original plan stands (spec §14 milestones)

| # | Milestone | Status |
|---|---|---|
| 1 | Foundation (db, settings, ledger, budget, router, gate, registry, worker, tasks, heartbeat, backup) | Done |
| 2 | Telegram (polling, approvals, commands, /pause, chat) | Done |
| 3 | Portfolio library (site + Instagram import, tagging, matcher) | Done |
| 4 | Gig Engine outreach half (prospecting, research, pitches, follow-ups, triage, suppression, limits) | Done |
| 5 | Gig Engine **money half**: quoting (`quote.standard` / `quote.large_or_custom`), **Stripe Checkout deposits**, payment polling, **calendar holds** (`calendar.hold`, expiry), booking confirmation email, `booked` stage | **Not started** (calendar client now exists: `lib/os/tools/calendar.js`) |
| 6 | Briefs, daily audit, playbook | Morning brief + weekly report **done**; **daily audit + playbook (learning loop) not built** — spec below |
| 7 | Dashboard v1 + rename | Done, plus console, voice, live updates, sales process |
| 8 | Dry-run week, then go-live (spec §12 checklist) | Not started; outreach is still in **draft mode** |

Beyond the plan, already built: sales process v1 (lead pages `/p/<token>`, clips, booking, Calls page, touch points,
retainer deals), research briefs with interview questions, console with voice and approve-by-talking proposals,
morning brief, weekly report, local-first model routing (`models.local_first`, on by default).

## Next tasks for Codex, in priority order

### 1. Learning loop (Jack approved it)

Goal: OTG-OS gets better from every decision, mostly on the free local model.

- **Migration 6** in `lib/os/db.js`: `playbook_rules (id INTEGER PK, text TEXT, scope TEXT CHECK in ('pitch','follow_up','all'),
  lane TEXT DEFAULT 'all', status TEXT CHECK in ('proposed','active','rejected','retired'), evidence TEXT JSON,
  source TEXT CHECK in ('audit','owner'), action_id TEXT, created_at, decided_at, decided_by)`. Update `tests/osDb.test.mjs` (count 6).
- **`lib/os/playbook.js`** `createPlaybook({ osDb, router, registry, settings, now, log })`:
  - `activeFor(kind, lane)` → rule texts for prompts; `list()`; `addRule({ text, scope, lane, by })` (owner rules are active at once);
    `retire(id, by)`.
  - A registry tool `playbook.rule` (actionType `playbook.change`; add `'playbook.change': { level: 'ask', ceiling: 'ask' }` to
    `DEFAULT_POLICIES` in `approvalGate.js`). `execute(payload)` activates the rule using `payload.draft` as the final text, so
    Telegram/dashboard Edit works. A rule whose action was rejected reads as `rejected` (sync lazily from the action status).
  - `audit(date)`: evidence pack of the last 14 days of `email.*` actions joined to opportunities — lane, angle, status,
    reject_reason, edit_ratio, original_draft vs final `payload.draft` (first 600 chars each when edited), replied?
    (stage replied+ or inbound), page viewed / clip played / call booked (touchpoints). Skip if fewer than 5 decisions since
    `learning.last_audit`. Ask `router.run('daily_audit', …)` (local-first puts Gemma first) for JSON
    `{ "rules": [{ "text", "scope", "lane", "evidence": [..] }] }`, max 3, drop duplicates of active/proposed rules, then
    `registry.request({ tool: 'playbook.rule', payload: { ruleId, text, scope, lane, draft: text }, why: { goal: 'Book more shoots
    with fewer edits', expected: 'More clean approvals and replies', evidence }, idempotencyKey: \`playbook:${ruleId}\` })`.
  - `isDue(date)`: 20:00 Pacific, once a day (`learning.last_audit` setting).
- Run it from the **gig engine** loop (slow work), like `autoDossiers` in `lib/os/gigs/engine.js`.
- **Use the rules**: in `lib/os/gigs/outreach.js`, append `Playbook rules from Jack (follow them):\n- …` to the content for pitch
  and follow-up drafts via `playbook.activeFor(kind, opp.lane)`; also in `lib/os/redraft.js`.
- Brain: add a read-only `get_playbook` tool in `lib/os/brain/chat.js` (INSIGHT_TOOLS, strict schema).
- Dashboard: a Playbook card in Settings (active rules with Retire, add-a-rule input, "Run review now" → `POST /api/os/playbook`).
- Tests (`node:test`, in-memory DB, fake router): audit proposes through the registry, approve activates, reject marks rejected,
  owner rules active at once, prompts include active rules, skip when too little data.

### 2. Money half (milestone 5)
Quote → Stripe Checkout deposit (poll payments; no public webhook needed) → calendar hold with expiry → booking confirmation
→ `booked`. Deals table (`deals`) already tracks retainers; extend for shoot-day quotes. Keep every money action behind Ask.

### 3. Dry run and go-live (milestone 8)
Spec §12. Outreach is in draft mode; `/mode send` (owner only) switches to sending.

### Smaller items
- `components/StudioDashboard.js` (untracked, another tool's file) has its workspace link changed to `/agents` in the working copy only.
- `app/agents/page.js` carries other tools' uncommitted edits to the old workspace page; review before committing them.
- Dashboard pause/resume Telegram message is prefixed with "⚠️" (it uses `notifier.alert`).
- Consider fewer Grok prospect searches (`gigs.daily_searches`, now 3/weekday): it is the biggest cost.

## How to work safely here

- Tests: `node --test tests/os*.test.mjs` (400 passing). Add tests for every new lib function.
- Many files are CRLF; edits must keep line endings. Template literals with `\n` are easy to mangle with shell heredocs —
  prefer editing files directly.
- The live DB `data/otg-os.sqlite` is shared with the running worker. Test UI against a copy:
  `VACUUM INTO` a scratch file, then run `next dev -p 4010` **from the agent-os folder** with `OTG_OS_DB_FILE=<copy>` and
  `TELEGRAM_BOT_TOKEN=` blank so nothing reaches Telegram. Clear `.next/dev` if API routes 404 after a production build.
  Don't submit test bookings: they send real Google Calendar invites.
- Never print `.env.local` values. Commit only your own files (the repo has many unrelated uncommitted changes).
- Deploy: `npm run build`, then restart both tasks:
  `Stop-ScheduledTask -TaskName "OTG-OS Web"; Start-ScheduledTask -TaskName "OTG-OS Web"` and the same for `"OTG-OS Worker"`.
  One "Telegram Conflict" log line right after a worker restart is normal.
- Network: dashboard is tailnet-only at `https://supawizard.tailfa9e27.ts.net` (tailscale serve). Only `/p/*` is public through
  Tailscale Funnel on `:8443` (`public.base_url` is set). Never map anything else to Funnel.
