# OTG-OS Core and Gig Engine v1 — Design

Date: 2026-10-14
Status: Draft for owner review
Owner: Jack Riggs, OFF THE GROUND (MadeByOTG.com)

## 1. Purpose

OTG-OS turns Agent OS into the operating system for OFF THE GROUND: an always-on assistant that works every day to book paid shoot days, explains why it does everything, asks before it acts until it has earned trust, and audits itself daily so it improves.

This spec covers the first release: the core system (brain, model router, tool connections, action ledger, approval gate, Telegram, briefs, daily self-audit) and the first money loop, the **Gig Engine** (find prospects → pitch → follow up → sort replies → send matched portfolio → quote → Stripe deposit → calendar hold → confirmed shoot).

### Goals (first 90 days after go-live)

- **Primary:** 12+ paid shoot days per month. Extra shooters and editors are available, so volume is the target.
- **Travel goal:** first paid French Polynesia or yacht job.
- **Budget:** start with a hard cap of $150/month for AI and paid data. Raise it only when OTG-OS-attributed deposits pay for it (Section 9).

### Inbound reality

Inbound leads are low. The Gig Engine therefore creates demand through targeted outbound work. Website enquiries continue to arrive in the existing OTG Studio app (app.madebyotg.com) and are not part of this release.

## 2. Business targeting

Home base: Fairfax, CA. Local means about one hour of driving: Marin, San Francisco, Sonoma, Petaluma, Napa and the East Bay. The owner will travel further when needed and will fly anywhere for travel work.

OTG-OS runs four lanes. Each lane has its own buyers, angle, default package and deposit rule.

| Lane | Priority | Buyers | Primary angle | Default deposit |
|---|---|---|---|---|
| Yacht, travel and tourism (French Polynesia first) | Main focus, protected dates | Resorts (Bora Bora, Moorea, Tahiti), yacht charter companies, cruise operators, Tahiti tourism board, yacht brokers | Destination brand films, drone cinematography, existing Bora Bora proof | 50% |
| Wineries (Marin, Napa, Sonoma) | High | Winery events and marketing managers | Preferred-vendor listing for weddings, harvest and release content, monthly content retainer | 50% |
| High-end local weddings and events | Selective | Venues and planners (partnerships), not individual couples | Referral partnership; only gigs at or above the wedding minimum | 50% |
| Real estate | Steady cash flow | Listing agents with active listings | Fast listing photo, video and drone packages; repeat weekly shoots | 100% upfront |

Rules:

- **Wedding minimum** is a setting. Default: $4,000 per wedding. Opportunities below it are closed with reason `below_minimum` and never pitched.
- **Protected travel dates:** calendar events tagged `TRAVEL` block local bookings on those dates. Local holds that conflict are not created; OTG-OS asks the owner instead.
- **Contact sources:** only business contact details published publicly by the business (website, public business profiles). OTG-OS does not buy contact lists, scrape personal data, or scrape sites whose terms prohibit it (for example MLS and portal sites such as Zillow and Redfin). Individual couples are not cold-contacted.

## 3. Architecture

OTG-OS runs on the owner's PC, which stays on 24/7. It is built inside the existing `agent-os` Next.js project. Nothing needs to be exposed to the internet: Telegram, Gmail and Stripe are all read by polling. Moving to a cloud host later is a deployment change, not a rewrite.

### Processes

1. **Web app** (existing Next.js server, port 4000): dashboard pages and the existing agent workspace.
2. **OTG-OS worker** (new long-running Node process, `scripts/otg-os-worker.mjs`): runs the daily schedule, polls Telegram, Gmail and Stripe, expires holds, sends briefs and runs audits. Both processes share one SQLite database.

Both start automatically on boot through Windows Task Scheduler ("at startup", "run whether user is logged on or not", "restart on failure every 1 minute, up to 999 times"). Windows Update active hours are set to avoid restarts during the working day.

### Units

Each unit has one job and a small interface. New code lives in `lib/os/`.

| Unit | File(s) | Job | Depends on |
|---|---|---|---|
| Database | `lib/os/db.js` | Opens `data/otg-os.sqlite` (Node `node:sqlite`), runs migrations, wraps transactions | none |
| Settings | `lib/os/settings.js` | Typed owner settings: packages, deposits, minimums, send limits, quiet hours, caps | db |
| Action ledger | `lib/os/ledger.js` | Records every action with what, why, expected result, cost, approval and outcome; enforces idempotency keys | db |
| Budget | `lib/os/budget.js` | Records spend per model/tool call; enforces the monthly cap and per-tool daily caps | db, settings |
| Model router | `lib/os/modelRouter.js` | Maps a task type to a model, applies fallbacks, meters cost through Budget | budget, provider clients |
| Approval gate | `lib/os/approvalGate.js` | Decides Ask, Tell or Silent per action type; promotes and demotes autonomy | ledger, settings |
| Tool registry | `lib/os/tools/registry.js` | Uniform tool interface: `name`, `actionType`, `risk`, `estimateCost()`, `execute()`; every external call goes through the gate and ledger | gate, ledger, budget |
| Tool adapters | `lib/os/tools/{gmail,calendar,stripe,telegram,webSearch,grokSearch,scrapeCreators,siteFetch}.js` | One adapter per external service | registry |
| Portfolio library | `lib/os/portfolio/{importer,matcher}.js` | Imports and tags portfolio pieces; picks the best 2–3 for a prospect; tracks results and gaps | db, router |
| Gig Engine | `lib/os/gigs/{stages,prospectFinder,prospectResearch,outreach,replyTriage,quoting,booking}.js` | The opportunity state machine and each stage's work | tools, portfolio, router, ledger |
| Brain | `lib/os/brain/{dailyPlanner,chat}.js` | Plans each day toward the goal; answers owner questions in Telegram | everything above |
| Reports | `lib/os/reports/{morningBrief,eveningRecap,dailyAudit}.js` | Builds briefs and the daily audit from the ledger | ledger, budget, playbook |
| Playbook | `lib/os/playbook.js` | Versioned rules and prompt guidelines; approve, apply and roll back changes | db |

### Existing agents

The existing agents remain as specialists the Brain calls through the model router: **Alex** for prospect research, **Maya** for pitch and follow-up copy, **Rex** for quotes, **Luna** for reply qualification. Their system prompts are updated from "OTG Icon" to OFF THE GROUND (MadeByOTG), and legacy car-sales (Toyota) context is excluded from all OTG-OS prompts and search.

The legacy timed "auto-jobs" (essay-generating background prompts every 30 minutes to 4 hours) are disabled by default. They are replaced by the goal-driven daily planner.

## 4. Model router

| Task type | Model | Fallback |
|---|---|---|
| Daily planning, tool-use decisions, owner chat | Claude Sonnet (`claude-sonnet-5-5`) | Wait and retry; never guess a decision on a weaker model |
| Pitch, follow-up and quote copy | Claude Sonnet | Local model drafts, marked "needs review", always routed to Ask |
| Reply classification, "is this prospect a fit", "does this need the owner" | Jev (when access is granted) | Claude Haiku (`claude-haiku-5-5`) |
| Bulk summaries, page digests, portfolio tag suggestions | Local Ollama (`qwen3.5:9b`) | Claude Haiku |
| X and live web search for prospects and signals | Grok API with search tools | Existing free web search providers |
| Sunday week-over-week audit view | Claude Opus (`claude-opus-5-5`) | Claude Sonnet |

Reserved slots, out of scope for v1: **Codex** (coding changes to OTG-OS proposed by the audit), **Muse Spark** model API, and Meta **Muse for Small Business** (used by the owner directly in Meta's apps for their own Instagram and Facebook analytics; it has no developer API for that data).

Every model call records tokens and estimated cost through Budget. Prices live in a settings table so they can be updated without code changes.

## 5. Gig Engine

### Opportunity stages

`found → researched → pitched → following_up → replied → portfolio_sent → quoted → held → booked`

Closing stages: `closed_no`, `closed_not_now` (with a check-in date), `closed_unsubscribed`, `closed_below_minimum`, `closed_bounced`, `closed_hold_expired`, `closed_lost`.

Every stage change writes a `stage_events` row with the reason. Stage transitions are enforced by `stages.js`: an invalid transition throws and is logged.

### Stage work

1. **Found.** `prospectFinder` searches per lane using public web search, Grok search and the prospect's own website. It records the business, lane, location, distance from Fairfax for local lanes, source URL and the fit reason. Duplicates are merged by website domain.
2. **Researched.** `prospectResearch` (Alex) finds the publicly listed business contact, the best angle, and evidence (for example "hosts weddings: yes, per events page"; "Instagram active, little video"). ScrapeCreators profile checks count against the existing 20-credit daily cap. The portfolio matcher picks 2–3 pieces.
3. **Pitched.** `outreach` (Maya) drafts a short personal email that links the matched portfolio pieces. First contact is always **Ask** (Section 6).
4. **Following up.** Up to 2 follow-ups, 4 and 9 days after the pitch, in the same Gmail thread. Any reply stops the sequence.
5. **Replied.** `replyTriage` classifies the reply as `interested`, `wants_examples`, `asks_price`, `not_now`, `no` or `unsubscribe`, with a confidence score. Confidence below 0.75 goes to the owner as Ask.
   - `wants_examples` → send a matched set filtered by the style they asked about.
   - `asks_price` / `interested` → move to quoting.
   - `not_now` → `closed_not_now` with a check-in date (default 60 days, or the next harvest season for wineries).
   - `no` → `closed_no`.
   - `unsubscribe` → add the address and domain to the permanent suppression list; `closed_unsubscribed`.
6. **Quoted.** `quoting` (Rex) builds a quote from the package catalog in settings (initial prices from current OTG service ranges), the lane's deposit rule, and a Stripe Checkout link. Quotes over $3,000, any discount, or any custom pricing are **always Ask**.
7. **Held.** When a quote names a date, `booking` creates a Google Calendar event `HOLD – <business> (expires <date>)`. Hold expiry: 72 hours for local lanes, 7 days for travel. On expiry the event is removed, the opportunity becomes `closed_hold_expired` unless the client has replied, and the owner is told.
8. **Booked.** Every 5 minutes the worker checks open Stripe Checkout sessions. On payment, `booking` rechecks the calendar for conflicts, converts the hold to `SHOOT – <business> – <package>` with a "crew needed" note, sends the client a confirmation, and messages the owner: "💰 <business> booked, <date>, $<deposit> deposit received."

### Outreach safety

- **Email only** for outbound in v1. No cold SMS (TCPA).
- Every cold email includes the sender's real name, an accurate subject line, the business mailing address and a one-line opt-out (CAN-SPAM). Opt-outs are honored immediately and permanently.
- **Send limits:** 15 new pitches per day and 40 total outbound emails per day to start. Limits are settings and change only through an approved playbook change.
- **Sending window:** 9am–5pm in the recipient's local time zone, weekdays.
- **Auto-pause:** a lane's outreach pauses if its bounce rate exceeds 5% or its unsubscribe rate exceeds 2% over its last 50 sends. The owner is told why.

### Portfolio library

- **Sources:** the Work pages on MadeByOTG.com (read from the public site) and Instagram @MadeByOTG (official Instagram API if the account token works; otherwise ScrapeCreators within the daily credit cap).
- Each piece stores title, public URL, thumbnail, lane, style (for example cinematic, documentary, editorial), location, deliverable type (film, reel, photo set, drone) and date. The local model suggests tags; the owner corrects them once in the Portfolio page.
- New posts are imported daily.
- **Matcher:** scores pieces by lane, style and location match, then recency; returns the top 2–3.
- **Results:** each send records which pieces were included, so the audit can report which pieces lead to replies and bookings.
- **Gap alerts:** when three or more prospects ask for a style with no matching piece, the daily audit proposes a spec shoot or content to create.

## 6. Approvals and autonomy

### Levels

- **Ask:** drafted, sent to Telegram with Approve / Edit / Reject. Nothing happens until approved.
- **Tell:** done, then reported immediately, with an Undo button where undo is possible (calendar holds).
- **Silent:** done, then listed in the evening recap.

### Starting levels and ceilings

| Action type | Starts | Ceiling |
|---|---|---|
| `research.*` (prospect lists, research, portfolio import) | Silent | Silent |
| `calendar.hold` | Tell | Silent |
| `email.first_contact` | Ask | **Ask (permanent)** |
| `email.follow_up` | Ask | Silent |
| `email.portfolio_send` | Ask | Silent |
| `quote.standard` (catalog price, ≤ $3,000, no discount) | Ask | Silent |
| `quote.large_or_custom` (> $3,000, discount, custom) | Ask | **Ask (permanent)** |
| `email.booking_confirmation` | Ask | Silent |
| `booking.cancel`, `payment.refund` | Ask | **Ask (permanent)** |
| Spending beyond the monthly cap; deleting records | Never allowed | Never allowed |

### Moving up and down

- **Promotion:** after 20 consecutive approvals of an action type with no edits, OTG-OS asks the owner to move it up one level. Only the owner can approve a promotion.
- **Demotion back to Ask** happens automatically on any of these:
  - an approval where the owner's edit changed more than 25% of the draft (edit ratio = character-level edit distance between draft and sent text ÷ draft length, stored as `actions.edit_ratio`),
  - a recipient complaint or spam report,
  - that lane exceeding the bounce or unsubscribe threshold,
  - the owner pressing Reject twice in a row on that action type.

### Telegram

- Private bot created by the owner through BotFather. It responds only to the owner's Telegram user ID; all other senders are ignored and logged.
- The worker polls with `getUpdates` (no public URL needed).
- Approvals arrive as messages with inline buttons: **Approve**, **Edit** (the owner replies with changes; OTG-OS redrafts and asks again), **Reject** (followed by one-tap reasons: wrong target, wrong tone, bad timing, other).
- Non-urgent approvals are bundled at 9am, 1pm and 5pm. Booking and payment messages send immediately.
- Quiet hours 9pm–7am Pacific, except payment and booking notices.
- **Commands:** `/today`, `/pipeline`, `/approvals`, `/budget`, `/pause` (stops all outgoing actions immediately), `/resume`.
- Free-text questions go to the Brain's chat, which answers from the database and tools (for example "what's booked this week?", "find yacht brokers in Papeete").

## 7. Daily rhythm, briefs and self-audit

| Time (Pacific) | What happens |
|---|---|
| 7:00am | Daily planner runs |
| 7:30am | Morning brief sent |
| 9am–5pm | Outreach sends within limits and windows; approval bundles at 9, 1 and 5 |
| Every 5 min | Telegram, Gmail replies and Stripe payments polled; hold expiry checked |
| 7:00pm | Evening recap and daily audit sent |

### Daily planner

The planner compares booked shoot days for the next 60 days against the 12-per-month goal, looks at pipeline health per lane, and ranks candidate actions by expected value:

`expected value = probability of booking × typical job value ÷ (estimated cost + owner effort)`

Probabilities start from playbook defaults and are updated from the ledger as results come in. Every planned action is written to the ledger with its reason before it runs.

### Morning brief

- Calendar against the goal (for example "November: 6 of 12 shoot days booked, 3 holds pending").
- Money: deposits received yesterday, balances owed, open quote value.
- Approvals waiting, with buttons.
- Today's plan, with the reason for each item.
- One money idea of the day: a specific opportunity found by research.

### Evening recap and daily audit

- **Recap:** what was done, what came back (replies, quotes, bookings), spend today and month-to-date against the cap, anything blocked.
- **Fixes** (proposed the same day): broken steps, failing tools, bounces, wasted spend, mis-targeted prospects.
- **Conclusions** (proposed only with enough evidence): comparisons need at least 20 sends per variant, and lane-level shifts need at least 30 pitches in each lane compared. Below that the audit says "watching, too early" with the current numbers.
- **Prediction check:** compares each action's expected result in the ledger with its actual result and reports the largest misses and why.
- **Up to 3 proposed changes per day,** each with evidence, expected effect and a rollback condition. Each needs owner approval in Telegram.
- **Sundays** add a week-over-week view per lane (found → pitched → replied → quoted → booked, revenue, cost per booking) on Claude Opus.

### Playbook

The playbook holds lane targeting rules, pitch guidelines, follow-up cadence, send limits, probability defaults and thresholds. Approved changes create a new version with the reason, date, evidence and rollback condition. If a change's rollback condition is met, the next audit proposes rolling back. **OTG-OS never changes its own playbook without owner approval.**

## 8. Data model

Database: `data/otg-os.sqlite`. Money is stored in integer cents. Times are UTC ISO strings; display is Pacific.

| Table | Key fields |
|---|---|
| `settings` | key, value (JSON), updated_at |
| `businesses` | id, name, lane, website_domain (unique), location, distance_minutes, source_url, fit_reason, created_at |
| `contacts` | id, business_id, name, role, email, email_source_url, suppressed |
| `opportunities` | id, business_id, contact_id, lane, stage, package_id, proposed_date, quote_cents, deposit_cents, stripe_session_id, calendar_event_id, gmail_thread_id, attributed_to_otg_os, version, created_at, updated_at |
| `stage_events` | id, opportunity_id, from_stage, to_stage, reason, actor, created_at |
| `actions` (ledger) | id, idempotency_key (unique), action_type, opportunity_id, payload (JSON), why (goal, evidence, expected_result), autonomy_level, status (`proposed` / `approved` / `rejected` / `executing` / `done` / `failed`), approved_by, edit_ratio, cost_cents, result (JSON), outcome (JSON), created_at, executed_at |
| `autonomy_policies` | action_type, level, ceiling, consecutive_clean_approvals, last_demotion_reason |
| `suppression` | email_or_domain (unique), reason, created_at |
| `spend` | id, provider, model_or_tool, task_type, tokens_in, tokens_out, units, cost_cents, action_id, created_at |
| `portfolio_items` | id, source, url (unique), title, thumbnail_url, lane, style, location, deliverable_type, published_at, tags_confirmed |
| `portfolio_sends` | id, opportunity_id, portfolio_item_id, action_id |
| `playbook_versions` | id, version, content (JSON), reason, evidence, rollback_condition, approved_at, rolled_back_at |
| `audits` | id, date, kind (`daily` / `sunday`), report (JSON), created_at |

All writes that touch more than one table run in a transaction. Opportunity updates use the `version` column for optimistic concurrency.

## 9. Budget

- **Monthly hard cap: $150.** Warning at $100. At the cap, paid model and data calls stop, drafting falls back to local models, decisions that need Claude wait, and the owner is told.
- The existing ScrapeCreators daily cap (20 credits) stays and counts toward the monthly total.
- **Raising the cap:** when deposits from OTG-OS-attributed opportunities in the last 30 days reach at least 10× the current cap, the audit may propose the next tier ($400, then $1,000). The owner approves every raise.
- Stripe processing fees are tracked separately as cost of sales, not as AI spend.

## 10. Failure handling

| Failure | Behavior |
|---|---|
| Claude unavailable or slow | Drafting falls back per Section 4; decisions wait and retry with backoff; partial messages are never sent |
| Tool error (Gmail, Calendar, Stripe, Telegram) | Action stays `approved` or `executing`, retried with exponential backoff (1, 5, 15, 60 minutes); after 4 failures the owner is told in Telegram |
| Expired Google or Stripe credentials | Action pauses; owner gets "Google disconnected — reconnect" with the steps |
| Retry after a crash mid-send | Idempotency key prevents a second send; Gmail sent-thread check confirms whether the first attempt went out |
| Calendar conflict at hold or booking | No event is created; owner is asked |
| Budget cap reached | Section 9 |
| Bounce or complaint spike | Lane auto-pause (Section 5) and autonomy demotion (Section 6) |
| PC restart or crash | Both processes restart via Task Scheduler; all state is in SQLite; scheduled work resumes from the database |
| Worker silent | Worker pings a Healthchecks.io check every 5 minutes; a missed ping for 15 minutes alerts the owner through Healthchecks' own email or Telegram integration |
| Owner needs everything stopped | `/pause` |

## 11. Dashboard v1 (minimal)

The full dashboard redesign is a later spec. This release adds `/os` pages so the owner can see and correct what Telegram summarizes:

- **Today:** the morning brief, goal progress and spend.
- **Approvals:** the same items as Telegram, with the same three actions.
- **Pipeline:** opportunities by stage and lane; each opens a detail view with its stage history and ledger entries, including the "why" for each action.
- **Portfolio:** the library with tag correction.
- **Settings:** packages, deposits, wedding minimum, send limits, quiet hours and caps.

The app's display name becomes **OTG-OS**. `/` opens `/os`; the existing agent workspace moves to `/agents`; `/studio` is unchanged. The project folder stays `agent-os` to avoid breaking scripts and paths. Pages work at phone width over Tailscale.

## 12. Testing and release

### Automated tests (`node --test`, matching the existing `tests/` pattern)

- Stage machine: valid and invalid transitions.
- Approval gate: starting levels, ceilings, promotion after 20 clean approvals, each demotion trigger.
- Ledger: idempotency (a repeated key never executes twice), transactional writes.
- Budget: spend recording, warning, hard cap stop, per-tool daily cap.
- Outreach rules: suppression blocks forever, send limits, sending window, auto-pause thresholds.
- Booking: hold expiry, conflict refusal, paid session → confirmed event exactly once.
- Portfolio matcher: lane, style and location ranking.
- Model router: task mapping and each fallback path.
- Tool adapters tested against recorded responses; no live calls in the test suite.

### Dry-run week

Before touching real prospects, OTG-OS runs the full loop for 7 days with real research, but:

- every outbound email is redirected to the owner's own address,
- Stripe runs in test mode,
- holds and bookings go to a separate "OTG-OS Test" Google calendar.

The owner reviews what it would have done. Go-live is a single setting change after approval.

### First-release acceptance checklist

- An approved pitch sends exactly once, including across a worker restart.
- An unsubscribe permanently blocks that address and domain.
- An unpaid hold expires on schedule and the owner is told.
- A paid test deposit becomes a confirmed shoot event and a Telegram message within 10 minutes.
- Reaching the cap stops paid calls and switches drafting to local.
- A PC restart loses no state and both processes come back without manual action.
- `/pause` stops all outgoing actions within one polling cycle.
- Every executed action shows its "why" in the Pipeline detail view.
- Morning brief, evening recap and daily audit arrive on schedule for 7 consecutive days.

## 13. Owner setup tasks

These require the owner's identity or credentials and cannot be done by OTG-OS:

1. Create a **Stripe** account (identity and bank details). Add the test and live secret keys to `.env.local`.
2. Create a **Google Cloud** project, enable the Gmail and Calendar APIs, and complete the OAuth consent for the business Gmail account. (The Gmail and Calendar connections in Claude cannot be reused by OTG-OS.)
3. Create the **Telegram bot** with BotFather; add the bot token to `.env.local`.
4. Add an **Anthropic API key** and an **xAI (Grok) API key** to `.env.local`.
5. Create a free **Healthchecks.io** check and add its ping URL.
6. Provide the **business mailing address** (a PO box is fine) for the email footer.
7. Join the **Jev** waitlist at typesafe.ai (optional; Claude Haiku is used until access arrives).
8. Confirm the starting **package catalog and prices**.

## 14. Implementation milestones

1. **Foundation:** database, settings, ledger, budget, model router, approval gate, tool registry, worker process, Task Scheduler setup, Healthchecks heartbeat, daily database backup to cloud storage.
2. **Telegram:** bot polling, approvals with buttons, commands, `/pause`, chat.
3. **Portfolio library:** MadeByOTG.com and Instagram import, tagging, matcher.
4. **Gig Engine, outreach half:** prospect finding and research per lane, pitches, follow-ups, reply triage, suppression, send limits.
5. **Gig Engine, money half:** quoting, Stripe Checkout, calendar holds, payment polling, booking confirmation.
6. **Briefs, daily audit and playbook.**
7. **Dashboard v1 pages and rename.**
8. **Dry-run week, then go-live.**

## 15. Out of scope for this release

- Research Engine v2 (vidIQ outlier search, Grok trend radar, budgeted social data for client content).
- Full dashboard redesign.
- Crew roster, availability and automatic crew assignment.
- Voice briefings.
- Codex-driven code changes, Muse Spark model use, and Muse for Small Business integration.
- Sync with the OTG Studio app (blocked until its source code or an export is available). Until then, OTG-OS holds the outbound opportunities it creates, and website enquiries stay in OTG Studio.
- Inbound website enquiry handling.
- SMS outreach.

## 16. Known risks

- **Two places hold client records** (OTG-OS for outbound, OTG Studio for website enquiries) until the OTG Studio sync exists.
- **Cold email deliverability from a single Gmail account** limits volume. The send limits are deliberately conservative; a dedicated sending domain may be needed if volume must grow.
- **Thin early data:** the first weeks will have few results per lane, so most performance conclusions will read "watching, too early."
- **Single machine:** a hardware failure stops OTG-OS until the PC is restored. The SQLite database should be backed up daily to cloud storage (part of milestone 1).
