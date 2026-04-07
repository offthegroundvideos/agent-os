# Canonical Architecture Spec

## Content Intelligence System v1.0

### Purpose

Build a system that turns:

- client strategy
- raw footage
- AI-generated creative
- platform performance
- funnel activity
- CRM outcomes

into:

- published short-form content
- attributable leads
- booked sales calls
- measurable revenue influence
- continuously improving content recommendations

### Primary business objective

For each client workspace, the system must answer:

- What content should we make next?
- Can we turn raw footage into content efficiently?
- Can we generate AI-native content when footage is weak or absent?
- Which posts create leads?
- Which leads become booked calls?
- Which calls become sales?
- What patterns should we double down on?

### Non-goals for v1

- Automating every social platform
- Supporting every niche equally well
- Fully replacing human review on sensitive claims
- Deep enterprise BI across all paid media channels
- Replacing human sales follow-up

### v1 focus

- Instagram Reels
- YouTube Shorts
- GHL funnel, calendar, and pipeline attribution
- Resolve-first footage editing
- Remotion-first template content

### Design principles

- Postgres is the canonical source of truth for system state.
- Object storage is the canonical source of truth for media binaries.
- GHL is the operational CRM and funnel layer, not the system-of-record for content state.
- Every asset gets an ID.
- Every state change emits an event.
- Every outbound post must map to a CTA and attribution path.
- Every recommendation must be explainable by performance and source data.
- Human approval gates exist for high-risk outputs.
- Idempotency is required for publish, webhook, and CRM-write operations.
- Views are secondary. Booked calls and revenue are primary.

### Standardized stack

- DeerFlow is the deep orchestration and delegated coding runtime.
- Agent OS is the business UI, operator cockpit, and domain-memory layer.
- LangGraph patterns are the reference architecture for durable agent workflows.
- PydanticAI-style structured output discipline governs all important payloads, handoffs, and records.
- Playwright plus Firecrawl or Crawl4AI power browser workflows, site crawling, and research ingestion.
- n8n remains the operational glue layer now, with Temporal as the later durability upgrade for critical long-running jobs.

### Best repositories and tools to standardize on

- DeerFlow for delegated coding, deep research, subagents, and bounded autonomous execution.
- Agent OS as the canonical mission-control application for client operations and workflow visibility.
- LangGraph as the orchestration pattern reference for stateful, resumable agent systems.
- PydanticAI as the reference model for typed outputs, schema validation, and reliable structured agent contracts.
- Playwright for browser automation, UI testing, and workflow validation.
- Firecrawl or Crawl4AI for web crawling, extraction, and LLM-ready research ingestion.
- n8n for current workflow automation, sync jobs, and webhook glue.
- Temporal for future durable execution once queue complexity and retry guarantees exceed n8n's comfort zone.

### Core internal services

- Control Plane / Orchestrator
- Client Intelligence Service
- Content Intelligence Service
- Media Intelligence Service
- Editing Orchestrator
- Resolve Worker
- Remotion Renderer
- Publishing Gateway
- Attribution Service
- Reporting Service
- Policy / QA Service

### Canonical data model anchors

- Client and strategy: client, brand_profile, offer, persona, campaign, content_pillar, objection, proof_asset, claim_rule
- Source content: source_media, transcript, speaker_segment, scene_segment, clip_candidate
- Content planning: topic_brief, hook_variant, script, cta, post_package
- Production: edit_job, render_job, content_asset, thumbnail_asset, caption_asset
- Distribution: published_post, platform_metric_snapshot
- Funnel and CRM: landing_page, lead, contact_link, opportunity, appointment, sale
- Analytics: event_log, attribution_touch, performance_rollup, recommendation

### State machines

- Source media: uploaded -> ingested -> transcribed -> segmented -> clip_candidates_created -> approved_for_use -> archived
- Source media failure states: ingest_failed, transcription_failed, segmentation_failed
- Script: draft -> qa_review -> approved -> production_ready -> rejected -> archived
- Edit/render: queued -> processing -> rendered -> qa_review -> approved -> published_ready -> published
- Edit/render failure states: render_failed, qa_failed, publish_failed
- Lead: new -> qualified -> booked -> showed -> proposal_sent -> closed_won -> closed_lost

### Canonical event model

Every state change emits an event.

Core event names:

- client.updated
- offer.updated
- media.uploaded
- media.ingested
- media.transcribed
- media.segmented
- clip.created
- script.created
- script.approved
- editjob.created
- renderjob.completed
- contentasset.approved
- post.published
- post.publish_failed
- cta.triggered
- landingpage.visited
- form.submitted
- lead.created
- opportunity.created
- appointment.booked
- appointment.attended
- sale.closed_won
- sale.closed_lost
- metric.snapshot_recorded

Canonical event chain:

media.uploaded
-> media.ingested
-> media.transcribed
-> media.segmented
-> clip.created
-> script.created
-> script.approved
-> editjob.created
-> renderjob.completed
-> contentasset.approved
-> post.published
-> landingpage.visited
-> form.submitted
-> lead.created
-> opportunity.created
-> appointment.booked
-> appointment.attended
-> sale.closed_won

### Production lanes

Resolve lane:

- Use when there is strong raw footage, real speakers, transcript-driven clipping, and human-feeling edits.
- Inputs: media IDs, clip selections, edit brief, subtitle style, render presets.
- Outputs: vertical renders, cutdowns, subtitle versions, textless masters, thumbnail frames.

Remotion lane:

- Use when the content is template-led, AI-native, batch-rendered, and overlay-heavy.
- Inputs: JSON props, script text, branding config, CTA config, proof snippets.
- Outputs: MP4 renders, alt aspect ratios, thumbnails, version variants.

Hybrid lane:

- Use when source footage needs structured overlays, proof graphics, CTA cards, and branded wrappers.

### Publish safety rules

- No publish without approved CTA.
- No publish without landing-page mapping.
- No duplicate publish on retry.
- Store platform post ID and permalink immediately.
- Retries must be idempotent.

### Attribution rules

Attach these fields to every lead and opportunity path:

- client_id
- campaign_id
- content_asset_id
- published_post_id
- platform
- cta_id
- cta_keyword
- landing_page_id
- utm_source
- utm_medium
- utm_campaign
- first_touch_timestamp
- last_touch_timestamp

### Managed website rule

- Client websites or campaign landing pages must be managed by us closely enough to preserve attribution and lead visibility.
- Every CTA must route into a tracked page or tracked next step that we control.
- Every managed page must capture contact information, hidden attribution fields, and conversion events.
- Contact records must be written into the CRM operational layer and mirrored back into canonical reporting records.
- The website experience is part of the funnel system, not a disconnected design artifact.

### Failure handling

- If publish fails, asset returns to published_ready.
- If GHL write fails, retry with idempotency key.
- If webhook payload is invalid, dead-letter and alert.
- If Resolve worker fails, reroute or mark lane unavailable.
- If Remotion render fails, preserve input props and error trace.
- If platform API rejects media, mark platform_validation_failed.

### SLA targets for v1

- Media ingest to transcript: under 15 minutes
- Transcript to clip candidates: under 10 minutes
- Script generation: under 2 minutes
- Render queue start: under 5 minutes
- Publish after approval: under 15 minutes
- GHL sync after form submit: under 1 minute
- Dashboard refresh lag: under 15 minutes

### v1 build order

- Phase 1: Spine
- Phase 2: Footage lane
- Phase 3: AI lane
- Phase 4: Intelligence

### Definition of done for v1

The system is real when, for one client, it can:

- ingest raw footage
- generate transcript and clip candidates
- create Resolve edit jobs
- create Remotion render jobs
- publish approved content
- route traffic to a mapped landing page
- write leads into GHL with attribution
- write bookings into opportunities and appointments
- report which posts produced which calls
- report which calls produced which revenue

### Open issues before implementation

- Single-tenant vs multi-tenant workspace model
- GHL custom objects vs Postgres-only content metadata
- Direct API-first vs human-assisted publishing in v1
- In-house vs managed transcription
- In-app reporting vs BI tool
- Centralized vs client-dedicated Resolve workers
- Exact lead-quality scoring formula
- Exact winner threshold formula

### Recommended next artifacts

- ERD for the Postgres schema
- API contract spec for each service
- State-transition table
- Webhook payload map for GHL sync
- Remotion composition registry
- Resolve job manifest schema
- Client dashboard spec
- v1 sprint plan

### Implementation note

This document is the target-state architecture contract. The current Agent OS app still uses JSON-backed persistence in places, but new system design should move toward this service model and these source-of-truth rules rather than away from them.
