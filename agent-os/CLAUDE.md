# Agent OS — Shared AI Context

> This file is read automatically by Claude (Cowork) and Codex at session start.
> Keep it updated as the project evolves so both tools stay in sync.

---

## What This Project Is

**Agent OS** is a locally-hosted, multi-agent content creation system built for the business **OTG ICON** (Off The Ground Icon) — a full-service creative agency, growth operations company, and production studio owned by Jack Riggs (offthegroundvideos@gmail.com).

The system automates the full content pipeline from strategy to publishing by backwards-engineering viral content for OTG's clients.

- **Stack:** Next.js 16, React 19, Tailwind CSS — running on `localhost:4000`
- **Location:** `C:\AI-Agents\agent-os`
- **Phone access:** `http://YOUR-TAILSCALE-IP:4000`
- **Not a git repo** — progress is tracked via files and docs rather than commits
- **Local AI inference:** Ollama at `http://localhost:11434`, models stored at `E:\ollama\models` (user env `OLLAMA_MODELS`; the old unused store is archived at `E:\ollama-archive`)

**What the system handles:**
1. Client intake via booking research (auto-starts pipeline on booking)
2. Viral content research (platform-specific + cross-platform synthesis)
3. Multi-agent pipeline: research → scripts → content plans → social calendar → publishing
4. Production bundle management and content calendar
5. Lead prospecting, funnel tracking, and local CRM records
6. Landing page / Website Studio generation
7. YouTube Shorts live publishing via YouTube Data API

---

## Agents (12 total)

| Agent | Shortcut | Role |
|-------|----------|------|
| Alex | `/alex` | Market Intelligence — research only, uses 5X Rule for viral qualification |
| Maya | `/maya` | Creative Director — scripts, copy, and creative direction |
| Jordan | `/jordan` | Growth Strategist — funnels, 30/60/90 plans, ManyChat |
| Dev | `/dev` | Tech Lead — builds technical assets, landing pages, APIs |
| Sam | `/sam` | Social Media Director — platform formatting, calendars, shoot schedules |
| Luna | `/luna` | Lead Qualifier — scores and routes inbound leads |
| Iris | `/iris` | Visual Strategist — shoot plans, storyboards, production schedules |
| Rex | `/rex` | Sales Agent — proposals, follow-up sequences, closing |
| Nova | `/nova` | Client Success — onboarding, reviews, referrals, retention |
| Pixel | `/pixel` | Brand and Product — identity, merch, ad creative briefs |
| Chief | `/ceo` | CEO — executive command, business reviews, priority setting |
| Arch | `/cto` | CTO — technical architecture and infra command |

**Full pipeline command:** `Run pipeline on [topic]` — triggers Alex → Maya → Jordan → Sam in sequence.

Each agent's system prompt and behavior lives in `lib/agents.js`. The pipeline handoff chain uses structured JSON signals (`[RESEARCH_COMPLETE]`, `[CONTENT_COMPLETE]`, etc.) appended to agent responses.

---

## Architecture

### Key Directories

- `app/` — Next.js app router. All API routes live under `app/api/`
- `lib/` — Core business logic modules (start here for any backend bug)
- `data/` — JSON flat-file data stores (the persistent state of the entire system)
- `components/` — React UI panels rendered in `app/page.js`
- `docs/` — Architecture docs and progress snapshots
- `cloudflare/` — Cloudflare worker templates for crawling and prospect radar
- `n8n/` — n8n workflow JSON exports (`lead-generation-pipeline.json`, `quick-qualify-lead.json`)
- `scripts/` — Utility scripts (`generate_pipeline_report_pdf.py`, `social-collector.mjs`)

### Core `lib/` Modules

- `agents.js` — All 12 agent definitions, Ollama URL/model config, OTG_CONTEXT string
- `processes.js` — Pipeline process management; stale processes auto-killed after 90 min running / 15 min stopping
- `backgroundQueue.js` — Durable background worker for pipeline and viral-research jobs
- `viralResearch.js` + `viralResearchStore.js` — Viral intelligence and transactional SQLite persistence
- `viralResearchJobs.js` — Durable research execution, progress, cancellation, and retries
- `contentCalendar.js` — Calendar and production bundle management
- `publishQueue.js` + `publishRuntime.js` + `publishingGateway.js` — Publishing system (split across three files)
- `memory.js` + `workingMemory.js` — Agent memory and live system snapshot
- `clientStore.js` — Client record management
- `contentRecords.js` + `productionOps.js` — Content and production tracking
- `learning.js` — Agent performance tracking by workflow type (chat/pipeline/autojob/n8n/manual)
- `comms.js` — Internal agent communications log
- `router.js` + `routingPolicy.js` — Agent routing and slash-command dispatch
- `growthOS.js` + `mediaIntelligence.js` — Growth and media analytics
- `leadProspects.js` + `prospectRadar.js` — Lead generation and prospecting
- `deerflowBridge.js` — Bridge to DeerFlow for deep research, bounded coding, and typed viral-intelligence dispatch
- `durableStore.js` — SQLite-backed durable store (`data/durable.sqlite`)
- `renderMediaStore.js` — Render media file management (`data/render-media/`)

### API Routes (`app/api/`)

Every backend action is an API route. Key ones:

- `POST /api/agent` — Send a message to any agent
- `POST /api/pipeline` — Start a full pipeline run
- `GET/POST /api/processes` — Process management
- `POST /api/booking-research` — Client intake webhook (auto-starts pipeline)
- `GET/POST /api/viral-research` + `/collect` + `/report` — Viral research, durable runs, and branded PDF delivery
- `GET/POST /api/content-calendar` — Calendar CRUD
- `GET/POST /api/publish-queue` — Publish job management
- `POST /api/publish-integrations` — Social platform integration actions
- `POST /api/cloudflare-ingest` — Ingest from Cloudflare crawl workers
- `GET /api/working-memory` — Live system snapshot (add `?refresh=true` to force)
- `GET /api/render-media/[renderJobId]` — Serve rendered media as MP4

### UI Panels (`components/`)

The main page (`app/page.js`) is a single-page app with a tab system. Panels include: WorkflowControlPanel, ProcessManager, ViralResearchPanel, ContentCalendarPanel, PublishQueuePanel, PublishIntegrationsPanel, ContentOSPanel, FunnelDashboardPanel, ProspectRadarPanel, LandingPageBuilder, DeerFlowPanel, CloudflareOpsPanel, LearningPanel, CommsMonitor, KpiPanel, ChapterPanel, FootageLibrary, PipelineReportsPanel, WorkingMemoryPanel.

### Data Stores (`data/`)

Most legacy persistent state lives here as JSON. Durable pipeline jobs and all canonical viral-intelligence records live in `durable.sqlite`:

- `processes.json` — Active and completed pipeline runs (**can get malformed on bad pipeline output — check this file first if pipeline bugs appear**)
- `viral-research.json` — Legacy viral research import/backup; no longer canonical
- `durable.sqlite` — Transactional viral intelligence, pipeline runs/events, and durable background jobs
- `content-calendar.json` — Scheduled content entries (40 entries currently)
- `production-ops.json` — Production state tracking
- `publish-queue.json` — Queued publish jobs (3 jobs)
- `assets.json` — Client asset records (58 assets, 7 clients)
- `funnel-records.json` — Funnel and attribution data
- `comms.json` — Agent communications log
- `deerflow-jobs.json` — DeerFlow delegated task records
- `lead-prospects.json` — Lead prospecting records
- `kpis.json` — KPI tracking data
- `memory/` — Per-agent memory files

---

## Current State (as of June 8, 2026)

### What's Working


- Multi-agent pipeline handoffs through the core creative chain (Alex → Maya → Jordan → Sam)
- Viral research with platform-separated datasets and cross-platform synthesis
- Transactional viral-intelligence storage with automatic legacy migration
- Durable research jobs with progress, restart recovery, cancellation, and retry
- Active n8n weekly trend radar, weekday client-scoped research, performance schedules, and branded PDF delivery
- Typed DeerFlow viral-intelligence contracts without duplicated canonical state
- Content calendar → production bundle → publish-ready state progression
- Publish queue with simulated publish flows
- YouTube Shorts live publishing via YouTube Data API (resumable upload)
- Funnel records, landing pages (Website Studio), and attribution plumbing
- Booking research intake via `POST /api/booking-research` (auto-creates client + starts pipeline)
- Cloudflare crawl ingest via `POST /api/cloudflare-ingest`
- Prospect Radar for public-web service-request discovery
- Agent learning tracked per workflow type
- Local CRM records for clients, bookings, funnel activity, and attribution
- DeerFlow bridge for delegated deep research and coding tasks
- Working memory auto-snapshot at `WORKING-MEMORY.md` and `data/system/working-memory.json`

### Known Issues / Buggy Areas


- **Pipeline runs can fail mid-way** — the system is described as "a bit buggy"; processes get auto-killed after 90 min if they don't complete
- **`processes.json` can get malformed** — truncated or invalid JSON can appear when a pipeline crashes mid-write; if the app behaves oddly, inspect this file manually
- **Live Instagram API posting** requires valid Meta credentials (not yet wired up)
- **Pipeline research write-back coverage** still needs expansion, but new viral records must write to SQLite rather than the legacy JSON backup
- **`PUBLIC_MEDIA_BASE_URL` must be set** to a public URL for live social publishing (localhost media won't reach the platform APIs)
- **Production build vs dev:** App currently runs via `npm start` (production); rebuild with `npm run build` before restarting if code changes were made

### Active Right Now

- 0 running pipelines
- 7 clients tracked, 87 assets, 46 calendar entries, 3 publish jobs
- 1 viral research entries
- 3 lead prospects
- Working memory next actions:
  - Set or create an active client so research and publishing stay scoped.
  - There are 1 production item(s) ready to publish.

---


## Environment Variables (`.env.local`)

Currently configured:

```
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=gemma4:latest       # primary chat model
RESEARCH_MODEL=gemma4:latest      # used for research tasks
AGENT_OS_API_SECRET=...           # optional; required for protected non-local API access
CLOUDFLARE_INGEST_SECRET=...      # protects /api/cloudflare-ingest (set)
```

Not yet configured (needed for full production):

```
PUBLIC_MEDIA_BASE_URL             # public URL for media serving (live publish requires this)
BOOKING_WEBHOOK_SECRET            # protects /api/booking-research
FIRECRAWL_API_KEY                 # enables Firecrawl discovery + IG/TikTok metrics fallback
SOCIAL_SCRAPE_WORKER_URL          # Cloudflare edge fetch for IG/TikTok metrics (cloudflare/social-metrics-worker.js)
SOCIAL_SCRAPE_WORKER_SECRET       # secret for the social metrics worker
SCRAPECREATORS_API_KEY            # specialized social API for IG/TikTok metrics (recommended for Instagram)
ENSEMBLEDATA_TOKEN                # alternative specialized social API
ANTHROPIC_API_KEY                 # OTG-OS brain (Claude Sonnet/Haiku/Opus)
TELEGRAM_BOT_TOKEN                # OTG-OS Telegram bot (from BotFather)
TELEGRAM_OWNER_ID                 # the only Telegram user the bot obeys
HEALTHCHECKS_PING_URL             # outside heartbeat for the OTG-OS worker
OTG_OS_BACKUP_DIR                 # daily database backups (use a cloud-synced folder)
PROSPECT_RADAR_DISCOVERY_URL      # URL of deployed Cloudflare discovery worker
PUBLISH_YOUTUBE_MODE              # set to "api" for live YouTube uploads
YOUTUBE_ACCESS_TOKEN
YOUTUBE_CHANNEL_ID
```

---

## How to Run

```bash
npm run dev    # development server (port 4000, hot reload)
npm run build  # production build
npm start      # clean local production start: stop stale Agent OS server, rebuild, start on port 4000
npm run start:no-build  # restart from the current .next build
npm run start:raw       # raw next start command for debugging
```

Check `*.err.log` files in the project root for server errors. Current pattern: `start.err.log`, `start2.err.log` etc. — most recent is `start5.err.log`.

---

## Architectural Direction

From `docs/stack-standardization-blueprint.md`:

- **Agent OS** owns the operator interface, client memory, workflow state, and all business-domain records — it is the source of truth for business workflow state
- **DeerFlow** owns bounded autonomous execution, delegated coding, and deep research tasks — it returns structured artifacts back into Agent OS
- **n8n** owns webhook glue and lightweight sync jobs that write into Agent OS local CRM records
- **LangGraph patterns** as reference architecture (durable step-based, checkpointed, retry-aware)
- **PydanticAI-style discipline** — typed payloads for agent handoffs, freeform text only for explanation
- **Playwright + Firecrawl/Crawl4AI** for research and browser workflows
- **Temporal** as a future upgrade for durable execution when n8n + JSON persistence is outgrown

---

## Working on This Codebase

### For Claude (Cowork)

- Focus on task coordination, research, writing, and diagnosing issues
- Read `WORKING-MEMORY.md` and the `data/` JSON files to understand current system state before acting
- When analyzing bugs, check `*.err.log` files in the project root first
- Check `lib/` for business logic — almost everything backend lives there
- When the pipeline is "stuck," `processes.json` is the first place to look

### For Codex

- Check `app/api/` before adding any new API endpoints — the route structure is flat under `app/api/[feature]/route.js`
- Agent behavior (system prompts, routing, model config) lives entirely in `lib/agents.js`
- Pipeline orchestration flows through `lib/processes.js` → `lib/backgroundQueue.js`
- Publishing logic is split across three files: `publishQueue.js`, `publishRuntime.js`, `publishingGateway.js`
- Preserve legacy JSON schemas; use explicit SQLite schema migrations for durable and viral-intelligence tables
- After any significant code change, note what was changed in `docs/` as a progress snapshot

### Both

- This is **not a git repo** — document significant changes in `docs/` rather than commits
- The system runs locally on Windows (user: AIOTG), accessed via browser or phone on Tailscale
- Ollama models are at `E:\ollama\models` (set via the `OLLAMA_MODELS` user environment variable); OTG-OS owner chat uses `gemma4:latest`, chosen with `scripts/eval-local-chat.mjs`
- The `OTG_CONTEXT` string in `lib/agents.js` is the canonical business context injected into every agent — update it if the team or services change

---

## Next Priorities


1. **Stabilize pipeline runs** — reduce mid-pipeline failures and stale kills; investigate why processes die before completing all steps
2. **Fix `processes.json` corruption** — add write-safety around pipeline step outputs to prevent malformed JSON
3. **Expand research write-back** — after pipelines complete, write viral findings through the transactional SQLite store
4. **Live social publishing** — set `PUBLIC_MEDIA_BASE_URL` to a public tunnel and finish Instagram Meta credential setup
5. **Wire DeerFlow as auto-coding worker** for bounded implementation tasks triggered from Agent OS

Viral research exports are intentionally limited to proven 5x winners so the video editor only receives formats that have already demonstrated outsized reach.
The viral research panel now opens with a sticky "what to make next" brief so the operator starts from the next viral cut instead of the raw dataset.
