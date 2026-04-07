# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Workspace Overview

This is a multi-project AI workspace at `C:\AI-Agents` on Windows 11. All projects share a local Ollama LLM server at `localhost:11434`. The workspace is NOT a single git repo — each subdirectory is its own project.

### Projects

| Project | Stack | Port | Purpose |
|---------|-------|------|---------|
| **agent-os** | Next.js 14, React 18, Tailwind | 4000 | OTG Icon Mission Control — 10 AI agents for creative agency ops |
| **deer-flow** | Python 3.12 (LangGraph + FastAPI) + Next.js 16 | 2026 | ByteDance's open-source super agent harness (sub-agents, sandbox, memory, skills) |
| **life-os** | Python scripts | — | Personal planning, task tracking, Google Calendar sync |
| **mcp-server** | Node.js (MCP SDK) | — | Model Context Protocol server bridging to Agent OS agents |
| **n8n-data** | SQLite | — | n8n workflow automation data directory |
| **footage-library** | File storage | — | Raw/edited/stock footage organized by category |

### Shared Infrastructure

- **Ollama**: `http://localhost:11434` — all projects connect here for LLM inference
- **Models available**: `qwen2.5-ctx32k` (default), `deepseek-r1-ctx32k` (reasoning), `qwen2.5:14b` (fast), `qwen3:32b`
- **Docker**: DeerFlow runs via Docker Compose (nginx + frontend + gateway + langgraph)
- **n8n**: Workflow automation with webhooks into Agent OS via `/api/n8n`

## Agent OS (`agent-os/`)

### Commands

```bash
npm run dev    # Dev server on http://localhost:4000
npm run build  # Production build
npm run start  # Production server on port 4000
```

### Architecture

Single-page Next.js 14 app with 10 specialized AI agents for OTG Icon creative agency. Each agent has a unique role, system prompt, model assignment, and keyboard shortcut.

**Agents**: Alex (research), Maya (creative), Jordan (growth), Dev (tech), Sam (social), Luna (lead qual), Iris (visual), Rex (sales), Nova (client success), Pixel (brand)

**4 Pipeline Types**: content, production, sales, full — each chains agents sequentially with structured JSON handoffs.

**Key lib files** (core logic lives here, not in API routes):
- `lib/agents.js` — Agent definitions, OTG_CONTEXT, PIPELINE_TYPES, SHORTCUTS, MODEL_TIMEOUTS
- `lib/router.js` — Message routing, `stripThinkBlocks()`, `buildHandoffContext()`, handoff JSON extraction
- `lib/comms.js` — Pipeline handoff logging, `measureTopicPickup()`, `updateHandoffUsage()`
- `lib/learning.js` — Lesson storage, win/failure tracking, skill refinement synthesis
- `lib/memory.js` — Per-agent conversation history (last 50), workspace file storage
- `lib/processes.js` — Process lifecycle (running/stopping/stopped/killed)
- `lib/chapters.js` — Team session tracking, progress reports

**API Routes** (12 total under `app/api/`):
- `/api/agent` — Single agent chat (POST)
- `/api/pipeline` — Multi-agent streaming pipeline via SSE (POST)
- `/api/reflect` — Self-reflection and skill refinement (POST/GET)
- `/api/n8n` — Synchronous pipeline endpoint for n8n webhooks (POST/GET)
- `/api/comms`, `/api/memory`, `/api/processes`, `/api/chapters`, `/api/clients`, `/api/ghl`, `/api/footage`, `/api/landingpage`

**Data persistence**: JSON files in `data/` directory (memory, workspace, chapters, clients, comms, footage).

### Critical Patterns

- **deepseek-r1 outputs `<think>` blocks** — must be stripped with `stripThinkBlocks()` before passing to downstream agents or they echo back
- **Handoff context** is JSON + 2-3 sentence brief only (never full output) via `buildHandoffContext()`
- **Background reflections** are staggered at `8000 + (i * 15000)` ms to avoid GPU contention
- **Pipeline streaming** uses SSE — the `/api/n8n` route wraps this synchronously for webhook consumers
- **Model timeouts**: deepseek-r1 = 12min, qwen2.5 variants = 5min, default = 6min

### Environment (`.env.local`)

```
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=qwen2.5-ctx32k
RESEARCH_MODEL=deepseek-r1-ctx32k
GHL_API_KEY=<GoHighLevel token>
GHL_LOCATION_ID=<GHL location>
```

## DeerFlow (`deer-flow/`)

DeerFlow has its own detailed AGENTS.md files at `deer-flow/backend/AGENTS.md` (31KB) and `deer-flow/frontend/AGENTS.md` (4.4KB). Refer to those for deep backend/frontend guidance.

### Commands

```bash
# Root (full stack)
make check           # Verify prerequisites (Python 3.12+, Node 22+, uv, pnpm, docker, nginx)
make install         # Install all deps (backend uv sync + frontend pnpm install)
make dev             # Start all services: LangGraph(2024) + Gateway(8001) + Frontend(3000) + Nginx(2026)
make stop            # Stop all services
make up              # Docker production build + start (port 2026)
make down            # Stop Docker containers

# Backend (from backend/)
make dev             # LangGraph server on port 2024
make gateway         # Gateway API on port 8001
make test            # pytest (277 tests)
make lint            # ruff lint
make format          # ruff format

# Frontend (from frontend/)
pnpm dev             # Next.js dev on port 3000
pnpm build           # Production build (needs BETTER_AUTH_SECRET)
pnpm lint            # ESLint
pnpm typecheck       # TypeScript check
```

### Architecture (4 services behind nginx)

- **Nginx** (port 2026) — unified entry, routes `/api/langgraph/*` to LangGraph, rest to Gateway
- **Frontend** (port 3000) — Next.js 16, React 19, TypeScript, Tailwind 4, pnpm
- **Gateway** (port 8001) — FastAPI REST API for models, MCP, skills, memory, uploads, threads
- **LangGraph** (port 2024) — Agent runtime with lead agent + 12-middleware chain

### Configuration

- `config.yaml` (gitignored) — models, tools, sandbox, memory, subagents, skills (create from `config.example.yaml`)
- `extensions_config.json` (gitignored) — MCP servers + skills enabled state
- `.env` — API keys (Tavily, Jina, OpenAI, etc.)

### Windows Docker Gotchas

- Docker socket mounts (`/var/run/docker.sock`) fail on Windows — remove from volumes
- `${HOME}/.Codex` and `${HOME}/.codex` bind mounts cause `mkdir Access is denied` — remove from volumes
- Git Bash translates Unix paths — use `MSYS_NO_PATHCONV=1` before `docker compose` commands
- Containers reach host Ollama via `host.docker.internal:11434`

### Skills

Located at `deer-flow/skills/public/`. Format: directories with `SKILL.md` (YAML frontmatter). 16+ skills including context-engineering, marketing, data-analysis, deep-research, frontend-design, remotion, anthropic-skills, superpowers.

## MCP Server (`mcp-server/`)

```bash
npm start  # Start MCP server
```

Bridges MCP protocol to Agent OS — exposes `talk_to_agent` tool for all 10 agents. Connects to Agent OS at `localhost:4000` and Ollama at `localhost:11434`.

## Life OS (`life-os/`)

```bash
python scripts/daily_planner.py --json  # Today's plan
python scripts/gcal_sync.py --sync      # Sync to Google Calendar
python scripts/task_manager.py          # Task CLI
```

See `life-os/AGENTS.md` for detailed guidance.

## Cross-Project Integration Points

- **Agent OS -> Ollama**: Direct HTTP calls for LLM inference
- **DeerFlow -> Ollama**: Via `host.docker.internal:11434` (Docker) or `localhost:11434` (local)
- **MCP Server -> Agent OS**: HTTP calls to `localhost:4000/api/agent`
- **n8n -> Agent OS**: Webhooks to `localhost:4000/api/n8n` (synchronous, no SSE)
- **n8n -> GHL**: GoHighLevel API for CRM operations (contacts, opportunities, workflows)
- **Skills**: Shared between DeerFlow (`deer-flow/skills/public/`) and Codex (`~/.Codex/skills/`)
