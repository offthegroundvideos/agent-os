# OTG-OS Dashboard v1 — Handoff for audit (Codex)

Date: 2026-10-15. Plan: `2026-10-15-otg-os-dashboard-v1.md`. Spec: `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md` §11, milestone 7.

## What was built

- Pages under `/os` (client components, phone-first, sci-fi HUD styling with an animated starfield):
  Today (`app/os/page.js`), Approvals, Pipeline + detail (`app/os/pipeline/[id]`), Portfolio, Settings.
  Shared UI: `components/os/{OsShell,ui,client,Starfield,ComputerConsole}.js`, styles in `app/os/os.css` (scoped `.os-root`).
- API under `app/api/os/{today,approvals,pipeline,pipeline/[id],portfolio,settings,control}/route.js`.
  `proxy.js` (untracked, owned by another tool) already guards `/api/*` on non-private hosts with `AGENT_OS_API_SECRET`;
  pages send the key from `localStorage` as `x-agent-os-secret` after a 401.
- Libs (all with `node:test` coverage, in-memory DBs):
  - `lib/os/approvalActions.js` — approve/reject/revise + keep Telegram copies in step. The Telegram bot now uses it
    (`telegram/bot.js`), and so does the dashboard. Logic below it is still `registry` → `ledger`.
  - `lib/os/settingsEditor.js` — whitelist of dashboard-editable settings with validators; `OUTREACH_MODES` (bot `/mode` uses it).
  - `lib/os/dashboard.js` — read models (today, approvals, pipeline, opportunity detail, portfolio, settings) + `tagPortfolio`.
  - `lib/os/web.js` — runtime singleton on `globalThis`, `isOwnerRequest` (loopback host or API secret), error mapping.
  - `ledger.listForOpportunity`, `time.pacificDayStart`, `portfolio.parseTags` (shared with `/tag`), setting `goals.monthly_shoot_days`.
- Routing: `/` redirects to `/os`; the agent workspace moved to `app/agents/page.js` (imports one level deeper).
  App title is OTG-OS.

## Round 2 (same day)

- **Console on Today**: ask OTG-OS anything by text or voice (Web Speech API), with optional spoken replies and
  quick-ask chips; `/` focuses it. `POST /api/os/chat` → `chat.ask(text, { channel: 'dashboard', history, taskType })`.
- **Smarter brain** (`lib/os/brain/chat.js`, Telegram too): read-only tools `get_today`, `list_pipeline`,
  `get_prospect` (name search), `get_worker_log`, `get_settings`; short conversation history; told it cannot act.
- **Console model**: new router route `console` (Claude Sonnet low effort, Gemma fallback, never DeepSeek), chosen by the
  new setting `chat.console_model` (`claude` default, `local` option in Settings). About 9 s vs 96 s on local Gemma.
- `runtime.dashboard` and `runtime.settingsEditor` now live in the runtime; `web.js` reuses them.
- Today: night-shift worker log terminal, hot leads (replied and beyond), failed actions with errors.
- Owner check also requires a loopback `x-forwarded-for` (Next fills it from the socket when absent).
- Installable: `app/manifest.js`, `app/apple-icon.js`, `public/otg-os-icon.svg`, full-screen meta on `/os`.
- Video editor "back" link now goes to `/agents`. `components/StudioDashboard.js` (untracked, another tool's) was edited
  in the working copy only.

## Bug fixed on the way

`/tag` replaced underscores with spaces before checking listed values, so `lane=real_estate` and `type=photo_set`
could never be saved. `parseTags` now only does that for free-text `location`.

## Verified

- `node --test tests/os*.test.mjs`: 352 pass (was 329).
- Browser at 1280px and 375px against a copy of the live DB with Telegram disabled: approve, edit, reject, tag fix,
  settings save/validation, 403 for a Tailscale-address request without the key, pause lane. No horizontal overflow.

## Not done / worth auditing

1. Production build and restart of the "OTG-OS Web" task (see below). Building rewrites `.next` under the running server.
2. `app/agents/page.js`: only HEAD content + import paths + header rename were committed; other tools' uncommitted edits
   to the old `app/page.js` remain as unstaged changes in `app/agents/page.js`. Review before committing them.
3. Owner check: loopback `Host` + loopback `x-forwarded-for`. Both can be forged by a peer that sends them, so the key
   is the real lock. A stronger option is to always require the key for settings writes.
5. Dashboard pause/resume posts a Telegram alert through `notifier.alert`, which prefixes "⚠️".
6. Spend/goal months are UTC (matches budget); "today" counts are Pacific.
7. Ideas: SSE/live updates instead of polling; let the console propose actions (through the ledger, never directly);
   weekly money report; keyboard shortcuts were skipped on purpose (a stray key must never approve an email).

## Rebuild and restart

```powershell
cd C:\AI-Agents\agent-os
npm run build
Stop-ScheduledTask -TaskName "OTG-OS Web"; Start-ScheduledTask -TaskName "OTG-OS Web"
```
