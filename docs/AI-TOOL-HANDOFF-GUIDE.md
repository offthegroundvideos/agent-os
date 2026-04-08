# AI Tool Handoff Guide

This guide explains how the team should switch between:
- Codex
- a new Codex account
- Claude Code

The goal is simple:
- keep code synced to GitHub
- keep shared AI context updated
- make tool switches safe when limits are reached

## What files matter

- [C:\AI-Agents\AI-HANDOFF.md](C:\AI-Agents\AI-HANDOFF.md)
  The shared handoff note. This is the first file the next AI session should read.

- [C:\AI-Agents\agent-os\WORKING-MEMORY.md](C:\AI-Agents\agent-os\WORKING-MEMORY.md)
  The latest Agent OS system snapshot. `AI-HANDOFF.md` pulls a snapshot from this file.

- [C:\AI-Agents\git-handoff.ps1](C:\AI-Agents\git-handoff.ps1)
  The repo sync engine. It checks the root workspace repo and the nested `deer-flow` repo separately.

- [C:\AI-Agents\update-handoff.ps1](C:\AI-Agents\update-handoff.ps1)
  The context sync script. It updates `AI-HANDOFF.md` before a switch.

- [C:\AI-Agents\setup-deerflow-fork.ps1](C:\AI-Agents\setup-deerflow-fork.ps1)
  The one-time DeerFlow fork setup script. It adds a safe push remote without changing the upstream remote.

## Commands to use

- `.\start-claude.ps1`
  Use before switching from Codex to Claude.

- `.\start-codex.ps1`
  Use before switching from Claude to Codex.

- `.\switch-codex-account.ps1`
  Use before moving from one Codex account to another Codex account after hitting a limit.

- `.\save-work.ps1`
  Use for a manual checkpoint when you are not switching tools.

## What the switch scripts do

Each switch script does two things:

1. Updates the shared handoff note
- asks for:
  - switch target
  - primary objective
  - what changed
  - next steps
  - blockers
- refreshes repo state
- copies the latest Agent OS working-memory snapshot into `AI-HANDOFF.md`

2. Syncs git state
- checks the root workspace repo at `C:\AI-Agents`
- checks the nested repo at `C:\AI-Agents\deer-flow`
- commits if there are changes
- fetches and rebases if behind
- pushes when safe

## Important repo note

`deer-flow` is currently pointed at the upstream ByteDance repo.

That means:
- the handoff script will still inspect it
- the handoff script will still pull/rebase it if needed
- the handoff script will skip pushing it until the remote is changed to your own fork

This is intentional and safer than accidentally trying to push to the upstream project.

## One-time DeerFlow fork setup

Before the team expects DeerFlow changes to push automatically, run:

`.\setup-deerflow-fork.ps1`

It will ask for your DeerFlow fork URL, for example:

`git@github.com:offthegroundvideos/deer-flow.git`

What it does:
- adds or updates a `fork` remote in `C:\AI-Agents\deer-flow`
- stores that remote as the preferred DeerFlow push remote
- keeps the current upstream remote intact for pulls and rebases

This is safer than rewriting `origin`, because it preserves the upstream source of truth while making pushes go to your own fork.

## Recommended daily workflow

### Codex -> Claude
1. Run `.\start-claude.ps1`
2. Answer the short handoff prompts
3. Let the script commit and sync
4. Claude opens
5. In Claude, read `AI-HANDOFF.md` first

### Claude -> Codex
1. Run `.\start-codex.ps1`
2. Answer the short handoff prompts
3. Let the script commit and sync
4. Open Codex
5. In Codex, read `AI-HANDOFF.md` first

### Codex account A -> Codex account B
1. Run `.\switch-codex-account.ps1`
2. Answer the short handoff prompts
3. Let the script commit and sync
4. Open the new Codex account
5. In the new Codex account, read `AI-HANDOFF.md` first

### Save without switching
1. Run `.\save-work.ps1`
2. Answer the short handoff prompts
3. Optionally enter a commit message
4. Let the script commit and sync

### First-time DeerFlow setup
1. Run `.\setup-deerflow-fork.ps1`
2. Paste your DeerFlow fork URL
3. Confirm `fork` appears in `git remote -v` inside `C:\AI-Agents\deer-flow`
4. After that, the normal switch scripts will push DeerFlow changes safely

## Best practices for the team

- Always run one of the switch scripts before leaving a tool session.
- Keep `AI-HANDOFF.md` short, practical, and current.
- Write blockers clearly. New AI sessions recover faster when blockers are explicit.
- Treat `AI-HANDOFF.md` as shared operational memory, not a diary.
- Open `AI-HANDOFF.md` first in every new AI session.
- If work was done only in `deer-flow`, still use the switch scripts. They handle both repos.

## Good handoff examples

### Primary objective
- Stabilize mobile Mission Control layout and verify full pipeline from phone

### What changed
- Removed Lovable path from Website Studio; rebuilt direct page builder; restored Cloudflare Ops panel

### Next steps
- Fix publish integration UI copy; verify GHL onboarding sync with live account

### Open blockers
- deer-flow push disabled until `.\setup-deerflow-fork.ps1` is run with our fork URL

## Onboarding checklist for a new teammate

1. Clone and open `C:\AI-Agents`
2. Confirm Git works in the root repo
3. Confirm Git works in `C:\AI-Agents\deer-flow`
4. Learn the four switch commands
5. Read `AI-HANDOFF.md`
6. Read `agent-os/WORKING-MEMORY.md`
7. Only then start a new Codex or Claude session
