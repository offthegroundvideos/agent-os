# Agent OS — Mission Control
SuperWizard5000 multi-agent system running locally on Next.js.

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
