# AI Tool Handoff Cheat Sheet

Use this file when you want the fastest possible switch between:
- Codex
- a new Codex account
- Claude

Read the full guide here if needed:
- [C:\AI-Agents\docs\AI-TOOL-HANDOFF-GUIDE.md](C:\AI-Agents\docs\AI-TOOL-HANDOFF-GUIDE.md)

## Commands

```powershell
.\start-codex.ps1
.\start-claude.ps1
.\switch-codex-account.ps1
.\save-work.ps1
```

## Prompt Answers You Can Reuse

### Codex

```text
Switch target: Codex
Primary objective: Continue the current implementation with full repo and handoff context
What changed: Synced latest Agent OS and DeerFlow work and refreshed the shared AI handoff note
Next steps: Read AI-HANDOFF.md first, continue the active task, and verify the next change
Open blockers: None
```

### Claude

```text
Switch target: Claude
Primary objective: Continue the current implementation with full repo and handoff context
What changed: Synced latest Agent OS and DeerFlow work and refreshed the shared AI handoff note
Next steps: Read AI-HANDOFF.md first and continue the active task
Open blockers: None
```

### New Codex Account

```text
Switch target: New Codex account
Primary objective: Continue the current implementation without losing repo or session context
What changed: Synced latest workspace changes and refreshed the shared AI handoff note
Next steps: Open the new Codex account, read AI-HANDOFF.md, and continue the current task
Open blockers: None
```

### Checkpoint Save

```text
Switch target: Checkpoint
Primary objective: Save current state before the next round of work
What changed: Completed the latest working pass and updated the handoff note
Next steps: Resume work from AI-HANDOFF.md
Open blockers: None
```

## Fast Rule Of Thumb

- `Primary objective` = what the next AI should do
- `What changed` = what you finished
- `Next steps` = the next 1 to 3 actions
- `Open blockers` = anything that could slow the next session down

## Team Habit

Before leaving any AI tool:
1. Run the correct handoff script.
2. Fill in the prompts clearly.
3. Let the script finish syncing.
4. Open [C:\AI-Agents\AI-HANDOFF.md](C:\AI-Agents\AI-HANDOFF.md) first in the next tool.
