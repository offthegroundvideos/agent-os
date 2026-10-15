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
3. `components/StudioDashboard.js` and `components/VideoEditorBridge.js` (other tools' files) still link "agent workspace"
   to `/`, which now lands on `/os`. They should point to `/agents`.
4. Owner check trusts the `Host` header (same trust level as `proxy.js`). A Tailscale peer could spoof `Host: localhost`.
   Consider checking the socket address or always requiring the key for settings writes.
5. Dashboard pause/resume posts a Telegram alert through `notifier.alert`, which prefixes "⚠️".
6. Spend/goal months are UTC (matches budget); "today" counts are Pacific.
7. Ideas: SSE/live updates instead of 30s polling; a "night shift" log view of the worker; sound/voice for the console.

## Rebuild and restart

```powershell
cd C:\AI-Agents\agent-os
npm run build
Stop-ScheduledTask -TaskName "OTG-OS Web"; Start-ScheduledTask -TaskName "OTG-OS Web"
```
