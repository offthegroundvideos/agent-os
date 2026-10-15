# OTG-OS Dashboard v1 — Implementation Plan

Date: 2026-10-15 · Spec: `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md` §11, milestone 7.

## Decisions (brainstorm)

- **Reads and writes go through `/api/os/*`, never server-rendered pages.** The proxy (`proxy.js`) only guards `/api/*`,
  so pages are client components that fetch from the API. Non-local hosts (for example a `*.ts.net` name) need
  `AGENT_OS_API_SECRET`; the pages ask for it once on a 401 and keep it in `localStorage`, sent as `x-agent-os-secret`.
- **One runtime per web process.** `lib/os/web.js` caches `createOsRuntime()` on `globalThis`. Opening the DB runs the
  same no-op migration check the worker and MCP server already run. Every call is a short synchronous statement or a
  `BEGIN IMMEDIATE` transaction from the existing stores; nothing holds a lock across a request.
- **Owner-only changes** (all Settings writes): allowed when the request comes to a loopback host (the owner's PC) or
  carries the API secret. Tailscale peers on a `100.x` address can read and approve (like Telegram admins) but need
  the key to change settings. Pause/resume stays open to anyone who can approve, as in Telegram.
- **No duplicated approval logic.** New `lib/os/approvalActions.js` holds approve / reject / revise plus keeping every
  Telegram copy in step. The bot now calls it, and so does the dashboard, so an approval on the web also updates the
  Telegram messages. Under it is still `registry.approve/reject/revise` → `ledger`.
- **Shared validation.** `/mode` and the Settings page use `OUTREACH_MODES` from `lib/os/settingsEditor.js`; lane
  pausing calls `gigs.setLanePaused` (what `/lane` calls); tag correction uses the new `parseTags()` from
  `lib/os/portfolio/index.js`, which `/tag` now also uses.
- **Goal progress** until Plan 3 lands: opportunities moved to `booked` this UTC month vs a new
  `goals.monthly_shoot_days` setting (default 12). No quotes, Stripe or calendar UI.
- **Routing:** `app/page.js` becomes a redirect to `/os`; the workspace moves to `app/agents/page.js` (imports one level
  deeper). Only path changes are committed; other tools' uncommitted edits to that file stay uncommitted.

## Tasks

1. `lib/os/time.js`: `pacificDayStart(date)` (UTC ISO of Pacific midnight). Test.
2. `lib/os/ledger.js`: `listForOpportunity(id)`. Test.
3. `lib/os/approvalActions.js` + refactor `telegram/bot.js` to use it; runtime exposes `approvals`. Tests.
4. `lib/os/settingsEditor.js`: whitelist of editable keys with validators; `goals.monthly_shoot_days` default. Tests.
5. `lib/os/portfolio/index.js`: export `parseTags()`; `tag()` uses it. Tests.
6. `lib/os/dashboard.js`: `today()`, `approvals()`, `pipeline()`, `opportunity(id)`, `portfolio()`, `settingsView()`,
   `latestWorkerLine()`. Tests with an in-memory DB and a temp log dir.
7. `lib/os/web.js`: runtime singleton, `isOwnerRequest()`, JSON helpers. Test `isOwnerRequest`.
8. API routes: `app/api/os/{today,approvals,pipeline,pipeline/[id],portfolio,settings,control}/route.js`.
9. Pages: `app/os/layout.js` (nav, key prompt), `app/os/page.js` (Today), `approvals`, `pipeline`, `pipeline/[id]`,
   `portfolio`, `settings`. Phone-first Tailwind.
10. Rename: `metadata.title` → OTG-OS; `/` → `/os`; workspace → `/agents`.
11. Verify: all OS tests, `npm run build`, browser check at desktop and 375px width.
