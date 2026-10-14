# Agent OS — Mission Control
SuperWizard5000 multi-agent system running locally on Next.js.

## Product North Star
Agent OS is a viral intelligence engine for OTG Icon. The core job is to scrub public and authorized social-platform data, identify content that is already proving organic demand, reverse-engineer the hooks and formats behind it, then hand those patterns through the agent pipeline so they become original scripts, schedules, production briefs, funnels, and client-ready reports.

The 5X rule is mandatory: content only qualifies as verified viral proof when `views >= 5 * follower_count`. For example, an account with `50,000` followers needs `250,000+` views to qualify.

See `docs/viral-intelligence-operating-spec.md` for the canonical operating spec.

## Production Viral Intelligence
- Evidence, creators, strategies, runs, briefs, and performance snapshots are transactionally stored in SQLite (`data/durable.sqlite`) with unique canonical and idempotency keys. Existing `data/viral-research.json` data is imported automatically on first use and remains as a legacy backup.
- Research collection runs through the durable background queue. Runs survive restarts, expose progress, support cancellation and retry, and reclaim interrupted workers after the configured heartbeat timeout.
- Versioned n8n workflows in `n8n/` run a weekly discovery-only trend radar, weekday client-scoped research, and daily performance snapshots. Configure and publish them using `n8n/README.md`.
- Weekday client collection uses an explicit opt-in queue from `/api/clients?action=researchQueue`; incomplete, prospect, disabled, and non-opted-in test records are skipped with visible reasons.
- Viral evidence follows a collect -> verify -> select -> approve -> produce gate. Trend-radar evidence is excluded from production strategies, and client briefs cannot enter production until an operator approves a proven source set.
- DeerFlow receives typed evidence IDs, strategy IDs, and transient execution context through `/api/viral-intelligence/*`; Agent OS remains the canonical owner of records.
- The Viral Research panel downloads a branded, client-ready PDF with direct source links and a strict separation between verified proof and candidates.

## OTG-OS Core
- OTG-OS is the always-on operating layer for OFF THE GROUND: an action ledger that records why every action happens, earned autonomy (Ask, Tell, Silent), budget caps, a model router, and a Telegram bot for approvals.
- Code lives in `lib/os/`; the database is `data/otg-os.sqlite`.
- Run the worker in a terminal with `npm run os:worker`. Create a test approval with `npm run os:demo`.
- To start everything at boot, run `scripts/install-otg-os-tasks.ps1` once from an administrator PowerShell.
- Required in `.env.local`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_ID` (send `/start` to the bot to get it), `ANTHROPIC_API_KEY`. Optional: `HEALTHCHECKS_PING_URL`, `OTG_OS_BACKUP_DIR` (point it at a Google Drive or OneDrive folder for off-machine backups).
- Design: `docs/superpowers/specs/2026-10-14-otg-os-core-gig-engine-design.md`. Plans: `docs/superpowers/plans/`.

## Agents
- Alex — Research Specialist (/alex)
- Maya — Content Writer (/maya)
- Jordan — Marketing Strategist (/jordan)
- Dev — Full Stack Developer (/dev)
- Sam — Social Media Manager (/sam)

## Commands
- /alex [task] — Direct to Alex
- /maya [task] — Direct to Maya
- /jordan [task] — Direct to Jordan
- /dev [task] — Direct to Dev
- /sam [task] — Direct to Sam
- Run full pipeline on [topic] — Trigger all agents in sequence

## Access
Local: http://localhost:4000
Phone: http://YOUR-TAILSCALE-IP:4000

## Local Startup
- `npm run dev` starts the hot-reload development server on port `4000`.
- `npm start` stops any stale Agent OS `next start` process on port `4000`, rebuilds, then starts the fresh production server.
- `npm run start:no-build` restarts the production server from the existing `.next` build.
- `npm run start:raw` runs the original `next start` command for low-level debugging.

## Publish Media Hosting
- Render outputs are served through `/api/render-media/<renderJobId>?platform=<platform>` as real MP4 responses.
- The app also materializes local files for render outputs under `data/render-media/<renderJobId>/`.
- Set `PUBLIC_MEDIA_BASE_URL` to a publicly reachable host or tunnel when testing live social publishing.
- Example: `PUBLIC_MEDIA_BASE_URL=https://your-public-host.example.com`
- Without that, publish readiness will correctly flag localhost media as not publicly reachable for live adapters.

## Booking Research Intake
- Agent OS now includes `POST /api/booking-research` for website booking intake.
- The booking payload should include at least `name` or `companyName`, plus `niche`.
- Example fields: `name`, `companyName`, `email`, `phone`, `website`, `niche`, `targetAudience`, `primaryGoal`, `primaryOffer`, `location`, `notes`.
- When a booking arrives, Agent OS creates or updates the client record, marks it active, and starts the research pipeline automatically.
- Set `BOOKING_WEBHOOK_SECRET` and send it as `x-booking-secret` to protect the route in production.

## YouTube Live Publishing
- The next live adapter after Instagram is now YouTube Shorts via the YouTube Data API resumable upload flow.
- Set `PUBLISH_YOUTUBE_MODE=api`, `YOUTUBE_ACCESS_TOKEN`, and `YOUTUBE_CHANNEL_ID` to enable live uploads.
- Test the connection at `/api/publish-integrations/test-youtube` or with `POST /api/publish-integrations` and action `test-youtube-connection`.
- Shorts are uploaded through the standard YouTube video upload endpoint; YouTube determines Shorts eligibility from the uploaded video itself.

## Instagram / TikTok Metrics Enrichment
- The live scanner and research library can now fill real views + follower counts for Instagram/TikTok candidates so the 5X rule can verify them (`lib/socialMetricsEnricher.js`).
- Provider chain, cheapest first: direct page parse (TikTok works with no keys), Cloudflare edge fetch (`cloudflare/social-metrics-worker.js` + `SOCIAL_SCRAPE_WORKER_URL`), Firecrawl (`FIRECRAWL_API_KEY`), and specialized social APIs (`SCRAPECREATORS_API_KEY` or `ENSEMBLEDATA_TOKEN` — recommended for Instagram).
- Re-verify saved records with `POST /api/viral-research` action `enrichMetrics`, or the "Verify IG/TikTok Metrics" button in the Viral Research panel.
- See `docs/social-metrics-enrichment.md` for setup and provider recommendations.

## Research Discovery Providers
- Viral Research supports a browser-search discovery lane by default.
- Firecrawl can be added as a second discovery provider for broader current-web recall during niche research.
- Configure `FIRECRAWL_API_KEY` to enable Firecrawl-backed discovery in the research collector.
- The collector still keeps platform-native datasets separate after discovery, then derives cross-platform themes second.
- A Cloudflare-based crawl architecture blueprint now lives in `docs/cloudflare-crawl-architecture.md` for scaling discovery, crawl orchestration, and normalized ingest.
- Agent OS now includes `POST /api/cloudflare-ingest` for normalized Cloudflare crawl webhooks.
- Set `CLOUDFLARE_INGEST_SECRET` and send it as `x-ingest-secret` to protect the ingest route.
- Viral research and lead prospect records are ingested separately so content intelligence and prospecting data stay cleanly partitioned.
- Worker payload examples now live in `docs/cloudflare-worker-ingest-example.md`, and the `CLOUDFLARE OPS` panel shows recent ingest records plus event history from the UI.
- A deploy-ready proxy worker template now lives at `cloudflare/agent-os-ingest-worker.js`.
- Prospect Radar now supports public-web service-request discovery for categories like weddings, festivals, and automotive.
- The Cloudflare worker template for that lives at `cloudflare/prospect-radar-discovery-worker.js`.
- Deployment instructions live at `docs/PROSPECT-RADAR-DISCOVERY-WORKER.md`.
- To launch discovery directly from the UI, set `PROSPECT_RADAR_DISCOVERY_URL` in `.env.local` after deploying the worker.

## Website Studio
- Website Studio builds landing pages directly inside Agent OS from pipeline context.
- The builder is optimized around clear outcome promises, proof-led heroes, one primary CTA, and mobile-safe qualification flows.

## Working Memory
- Agent OS now keeps a live-generated memory snapshot at `data/system/working-memory.json`.
- A human-readable version is written to `WORKING-MEMORY.md`.
- The snapshot auto-refreshes when clients, assets, calendar entries, processes, bookings, production ops, or publishing state change.
- You can fetch the latest snapshot at `/api/working-memory` and force a refresh with `/api/working-memory?refresh=true`.

## DeerFlow Coding Bridge
- Agent OS now includes a DeerFlow bridge at `/api/deerflow`.
- Deep research requests sent to `Alex` and bounded implementation requests sent to `Dev` or `CTO` can auto-dispatch to DeerFlow instead of relying only on the local Ollama chat path.
- DeerFlow job records are stored in `data/deerflow-jobs.json`.

## OFF THE GROUND Studio

- Open `/studio` for retainer agreements, monthly production, client acceptance, and the owner overview.
- Launch locally with `powershell -NoProfile -File scripts/start-otg-studio.ps1`. It uses loopback, `data/studio.sqlite`, and disables unrelated background jobs for this process.
- Add `-SkipBuild` when a current production build already exists.
- Implementation and the MadeByOTG integration plan: [docs/studio-dashboard.md](docs/studio-dashboard.md).
