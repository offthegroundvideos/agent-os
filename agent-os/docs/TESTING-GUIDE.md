# Agent OS Testing Guide

Last updated: April 9, 2026

## Purpose

This guide is the working test plan for Agent OS. It separates:

- smoke checks already run locally
- known failures and risky areas
- manual tests operators should run on desktop and mobile
- good test data hygiene so old demo context does not poison new runs

## Current Snapshot

### Passed in local smoke testing

- App shell loads at `http://localhost:4000`
- Ollama is reachable at `http://localhost:11434`
- One working local model is available: `qwen2.5:14b`
- `/api/agent` responds again
- `/api/clients?action=active` responds
- `/api/ghl?action=agencyStatus` responds
- `/api/publish-integrations` responds
- `/api/cloudflare-ingest` responds
- `/api/prospect-radar` responds
- `/api/working-memory` responds
- `/api/landingpage` can generate a page
- `npm run build` passes

### Known failures or warnings

- DeerFlow dispatch is still failing through the current bridge target. `/api/deerflow` loads, but the actual downstream DeerFlow job call is still returning a `404`.
- The current active client is polluted with old Toyota demo research content. This is the biggest test-data issue in the system right now.
- `/api/page-context?assetId=test` correctly returns no page context yet unless a real pipeline/page asset exists.
- Publish integrations are mostly in simulate mode or missing live credentials.
- The app is temporarily using `qwen2.5:14b` for both default and research work. That is okay for stability, but not the final preferred model split.

## Test Data Warning

Before testing client-aware flows, know this:

- Active client right now: `Cloudflare Demo Prospect`
- That client still contains Toyota-in-Marin demo research
- Any client-aware flow can inherit that data if you test against the wrong active client

Recommended cleanup before serious onboarding or pipeline testing:

1. Create or switch to a clean test client.
2. Use a clearly different niche, for example:
   - `Milo Brooks Nutrition`
   - `Niche: nutrition coaching`
   - `Offer: consultation call`
3. Avoid using the Toyota demo client for any serious validation.

## What I Tested

### 1. App Shell

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000' -UseBasicParsing
```

Expected:

- HTTP `200`
- main app loads

Observed:

- passed

### 2. Ollama Health

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -UseBasicParsing
```

Expected:

- HTTP `200`
- at least one model listed

Observed:

- passed
- current model available: `qwen2.5:14b`

### 3. Agent Chat Route

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/agent' `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"agentId":"alex","message":"Say only: online"}' `
  -UseBasicParsing
```

Expected:

- JSON response from the selected agent

Observed:

- passed
- route responded successfully

### 4. GHL Agency Status

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/ghl?action=agencyStatus' -UseBasicParsing
```

Expected:

- agency config returns current connection state

Observed:

- passed
- agency config is present

### 5. Publish Integrations Summary

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/publish-integrations' -UseBasicParsing
```

Expected:

- returns platform readiness summary

Observed:

- passed
- most live credentials are still missing
- current publishing state is mostly simulate/test oriented

### 6. Cloudflare Intake

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/cloudflare-ingest' -UseBasicParsing
```

Expected:

- returns Cloudflare intake summary

Observed:

- passed
- lead prospects and prospect opportunities are present

### 7. Prospect Radar

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/prospect-radar?limit=3' -UseBasicParsing
```

Expected:

- returns radar summary and recent opportunities

Observed:

- passed
- current demo opportunities exist

### 8. Landing Page Generator

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/landingpage' `
  -Method POST `
  -ContentType 'application/json' `
  -Body '{"assetId":"ast_testguide_001","businessName":"North Bay Nutrition","niche":"nutrition coaching","offer":"Consultation Call","location":"Bay Area, CA","headline":"Book a nutrition strategy call","subheadline":"Get a clear plan for energy, body composition, and consistency.","cta":"Book your consult","audience":"Busy professionals","proofPoints":["Custom plan","Real accountability","Simple next steps"]}' `
  -UseBasicParsing
```

Expected:

- returns generated HTML and page metadata

Observed:

- passed

### 9. DeerFlow Route

Command:

```powershell
Invoke-WebRequest -Uri 'http://localhost:4000/api/deerflow' -UseBasicParsing
```

Expected:

- returns DeerFlow jobs and routing policy

Observed:

- route loads
- actual DeerFlow job execution is still failing downstream with `404`

## Manual Test Plan

## A. Desktop Core Flow

### A1. App shell and tools

Steps:

1. Open `http://localhost:4000`
2. Confirm the shell loads
3. Open `TOOLS`
4. Open each of these panels once:
   - `GHL`
   - `DEERFLOW OPS`
   - `CLOUDFLARE OPS`
   - `PROSPECT RADAR`
   - `WEBSITE STUDIO`

Expected:

- no black screen
- no clipped modal on desktop
- close buttons work

### A2. Agent chat

Steps:

1. Select `Alex`
2. Send: `Say only: online`
3. Select `Maya`
4. Send: `Write 3 hooks for a nutrition coaching reel`

Expected:

- Alex responds
- Maya responds
- no immediate error toast

### A3. Full pipeline run

Use a clean niche and avoid the Toyota demo client.

Steps:

1. Open `FULL PIPELINE`
2. Fill in:
   - Client Name: `Milo Brooks Nutrition`
   - Niche: `nutrition coaching`
   - Primary Offer: `Consultation Call`
   - Target Audience: `Busy professionals`
   - Geography: `Bay Area, CA`
   - Primary Goal: `Book consultation calls`
   - Priority Platforms: `Instagram, TikTok`
   - Notes: leave blank unless you truly want extra context
3. Start the pipeline
4. Watch the live pipeline modal

Expected:

- the header is compact enough to see live output
- the live agent stream appears near the top of the right column
- no unrelated Toyota research appears in the prompt unless you used the polluted active client

### A4. Pipeline contamination regression test

This is the bug we just fixed.

Steps:

1. Open `FULL PIPELINE`
2. Use the exact nutrition inputs above
3. Leave `Specific research and execution notes` empty
4. Start the run

Expected:

- the prompt should only contain the form fields you entered
- it should not auto-inject old Toyota or Marin County strategy text

If it fails:

- capture the exact prompt shown
- note which client was active

## B. Website Studio and Landing Pages

### B1. Manual landing page generation

Steps:

1. Open `WEBSITE STUDIO`
2. Use:
   - Business: `North Bay Nutrition`
   - Niche: `nutrition coaching`
   - Offer: `Consultation Call`
   - Headline: `Book a nutrition strategy call`
   - Subheadline: `Get a clear plan for energy, body composition, and consistency.`
   - CTA: `Book your consult`
3. Generate the page

Expected:

- page copy matches the niche
- no wedding imagery
- no Toyota content
- form and CTA render cleanly

### B2. Mobile-first landing page check

Steps:

1. Open the generated page URL on your phone
2. Check:
   - hero fits
   - CTA is visible without layout breakage
   - form fields are usable

Expected:

- no horizontal cutoff
- form is usable on mobile

## C. GHL Onboarding Flow

### C1. GHL panel load

Steps:

1. Open `GHL`
2. Check `Agency`
3. Check `Clients`
4. Check readiness area

Expected:

- panel loads
- agency connection state displays

### C2. Full onboarding structure

Steps:

1. Select a clean client
2. Run:
   - `ATTACH LATEST PIPELINE PACKET`
   - `RUN FULL CLIENT ONBOARDING`
   - `STAGE GHL ONBOARDING PAYLOAD`

Expected:

- readiness updates
- staged CRM and website structure appears

### C3. Sync to GHL

Steps:

1. Click `SYNC ONBOARDING TO GHL`

Expected:

- note/contact sync should complete if credentials are valid for that client

Watch for:

- missing custom fields
- missing sub-account mapping

## D. Publishing

### D1. Publish Integrations Panel

Steps:

1. Open `Publish Integrations`
2. Review each platform block

Expected:

- platform states render
- missing credentials are explained

### D2. Simulated publish flow

Steps:

1. Open `Publish Queue`
2. Select a simulated or test-ready item
3. Run the publish action if available

Expected:

- queue item advances
- latest job appears in platform summary

## E. Cloudflare and Prospect Radar

### E1. Cloudflare Ops

Steps:

1. Open `CLOUDFLARE OPS`
2. Confirm:
   - summary counts load
   - recent events show
   - payload examples render

Expected:

- panel loads without exposing raw unmasked private contact info by default

### E2. Prospect Radar

Steps:

1. Open `PROSPECT RADAR`
2. Try a preset:
   - `Weddings`
3. Confirm current opportunities list
4. Click a direct link

Expected:

- opportunities render
- links are clickable

### E3. Launch discovery

Prerequisite:

- `PROSPECT_RADAR_DISCOVERY_URL` must be set to a live worker URL

Steps:

1. In `PROSPECT RADAR`, choose:
   - category: `weddings`
   - niche: `wedding photography`
   - location: `Orange County, CA`
   - year: `2027`
2. Click `LAUNCH DISCOVERY`

Expected:

- if worker URL is configured, request should launch
- if not configured, the app should fail clearly with the missing env warning

## F. DeerFlow

### F1. DeerFlow panel loads

Steps:

1. Open `DEERFLOW OPS`
2. Confirm repo choices render

Expected:

- panel loads
- mobile mode and concise mode controls appear

### F2. DeerFlow job dispatch

Steps:

1. Try a small Alex or Dev job from the panel

Expected right now:

- likely fails because the downstream DeerFlow runtime target still returns `404`

This is a known failure, not a new regression.

## G. Mobile Checklist

Use your phone over Tailscale.

### G1. App shell

Check:

- header visible
- no right-side clipping
- `TOOLS` opens
- buttons are tappable

### G2. Full pipeline

Check:

- `OPEN FULL PIPELINE BRIEF` works
- fields scroll correctly
- `RUN PIPELINE` stays reachable
- live pipeline modal is readable

### G3. Modals

Open these one by one on mobile:

- `GHL`
- `DEERFLOW OPS`
- `WEBSITE STUDIO`
- `CLOUDFLARE OPS`
- `PROSPECT RADAR`

Expected:

- no clipped right edge
- close controls reachable
- buttons respond

## Regression Targets

These are the most important things to watch after each big change:

1. Full pipeline prompt should not inherit stale unrelated research.
2. Live pipeline modal should prioritize active output over giant prompt chrome.
3. Mobile should not clip on the right side.
4. Agent chat should not throw immediate Ollama `404` errors.
5. DeerFlow route loading is not enough; actual dispatch must be tested separately.

## Suggested Test Order

For quickest confidence:

1. App shell
2. Agent chat
3. Full pipeline on a clean client
4. Website Studio page generation
5. GHL panel and onboarding status
6. Prospect Radar and Cloudflare Ops
7. Mobile shell and mobile pipeline run
8. DeerFlow dispatch

## Short Team Checklist

Use this when someone just needs to verify the app is not broken:

1. App loads on desktop
2. App loads on mobile
3. Alex chat returns a response
4. Full pipeline launches and shows live output
5. Website Studio generates a page in the right niche
6. GHL panel opens
7. Prospect Radar opens
8. Cloudflare Ops opens
9. No black screen
10. No unrelated niche contamination in the current test

## Backlog Reminder

When stability is better again, restore the preferred two-model setup:

- fast default model for chat
- stronger dedicated research model for pipelines and deep analysis
