# Life-OS - Personal Life Organization System

## Overview
This is Jack's personal life organization system. It manages daily planning, project tracking, objectives/OKRs, and Google Calendar sync.

## Directory Structure
- `data/` — JSON data files (projects, tasks, objectives, daily logs)
- `scripts/` — Python automation scripts
- `logs/` — Execution logs
- `templates/` — Templates for plans and reports

## Data Files
- `data/projects.json` — Active projects with objectives and key results
- `data/tasks.json` — All tasks (one-time + recurring) with priorities, due dates, calendar links
- `data/objectives.json` — Quarterly OKRs and yearly goals
- `data/daily_log.json` — Historical log of daily completions

## Scripts
- `scripts/daily_planner.py` — Generates daily summary (run with `--json` for machine-readable output)
- `scripts/gcal_sync.py` — Google Calendar sync (auth, sync tasks, push daily plans)
- `scripts/task_manager.py` — CLI for adding/completing tasks, updating progress

## How the Daily Agent Should Work
1. Run `python scripts/daily_planner.py --json` to get today's plan data
2. Analyze overdue tasks, today's tasks, project progress, and objectives
3. Generate a natural-language morning briefing for Jack
4. If Google Calendar is configured, run `python scripts/gcal_sync.py --sync`
5. Log the briefing

## Task Priority Rules
- HIGH: Due today or overdue, blocking other work
- MEDIUM: Due this week, important but not urgent
- LOW: Nice to have, no hard deadline

## When Managing Tasks
- Always use `scripts/task_manager.py` for modifications to ensure data consistency
- When completing tasks, the script auto-timestamps completion
- Link tasks to projects via `project_id` when relevant

## Google Calendar
- Tasks sync to a dedicated "Life-OS" calendar (auto-created)
- High priority = red, medium = cyan color coding
- Daily plan posted as all-day event for overview
- Recurring tasks create recurring calendar events
