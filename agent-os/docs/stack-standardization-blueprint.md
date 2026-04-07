# Stack Standardization Blueprint

Date: 2026-03-31

## Standardized stack

- DeerFlow for deep orchestration and delegated coding
- Agent OS for the business UI and domain memory
- LangGraph patterns as the reference architecture
- PydanticAI-style structured output discipline
- Playwright plus Firecrawl or Crawl4AI for research and browser workflows
- n8n now, Temporal later

## Ownership boundaries

### DeerFlow

- Owns bounded autonomous execution
- Owns delegated coding and ACP worker orchestration
- Owns deep research tasks that benefit from subagents and long-running execution
- Should return structured artifacts instead of becoming the system of record

### Agent OS

- Owns the operator interface
- Owns client memory, workflow state, content planning, production state, publish queue, and funnel reporting
- Owns canonical business context and decision surfaces
- Should remain the place where users see and control the system

### n8n

- Owns webhook glue, lightweight sync jobs, and system-to-system automation
- Owns current operational plumbing into GHL and related tools
- Should not become the canonical workflow-memory layer

### Temporal

- Later upgrade path for durable execution
- Best fit when render jobs, publish jobs, CRM sync, and retry guarantees outgrow n8n plus JSON persistence

## Reference architecture patterns

### LangGraph patterns

- Durable step-based execution
- Checkpointed state
- Retry-aware workflow edges
- Explicit handoffs between specialized workers
- Strong fit for research pipelines, production orchestration, and delegated coding flows

### PydanticAI-style discipline

Use typed structured outputs for:

- research packets
- platform packets
- cross-platform synthesis
- page briefs
- shoot schedules
- edit jobs
- render jobs
- publish jobs
- attribution touches
- lead and opportunity updates

Core rule:

- freeform text is for explanation
- typed payloads are for system state and agent handoffs

## Research and browser workflow stack

### Playwright

- UI testing
- browser debugging
- social workflow validation
- page QA
- operator flow testing

### Firecrawl or Crawl4AI

- niche crawling
- competitor site extraction
- help-center and landing-page extraction
- research ingestion for Alex
- structured web extraction beyond direct social pages

Recommended operating split:

- Playwright for interactive browser tasks and validation
- Firecrawl or Crawl4AI for broad crawl and extraction workloads

## Implementation order

1. Keep Agent OS as the mission-control front end
2. Expand DeerFlow as the delegated execution engine
3. Add typed schema discipline to every major handoff and stored record
4. Use Playwright plus Firecrawl or Crawl4AI to strengthen the research layer
5. Keep n8n for current glue workflows
6. Introduce Temporal only when durable execution pressure clearly demands it

## Immediate repo-level implications

### Agent OS

- Continue exposing clear APIs and stateful records
- Store typed research, production, publish, and funnel entities
- Trigger DeerFlow for bounded deep-work tasks
- Route Alex into DeerFlow for deep research when the task needs broader multi-step discovery
- Route Dev and CTO into DeerFlow for bounded coding and implementation tasks

### DeerFlow

- Act as the coding and deep-research worker
- Return structured output payloads back into Agent OS
- Use ACP workers for controlled code execution tasks

### Shared rules

- Agent OS is the source of truth for business workflow state
- DeerFlow is the source of truth for in-flight delegated task execution
- Cross-system contracts should be typed and versioned
- Human approval gates stay in Agent OS

## Near-term build priorities under this standard

1. Formalize typed schemas for research packets, page briefs, and publish jobs
2. Create a DeerFlow task bridge from Agent OS for bounded implementation and research tasks
3. Strengthen the multi-platform research layer with Playwright plus Firecrawl or Crawl4AI
4. Keep n8n as the live webhook and CRM sync layer
5. Revisit Temporal after publish, funnel, and media jobs are stable and clearly durability-constrained
