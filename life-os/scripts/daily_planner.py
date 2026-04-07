"""
Daily Planner Engine for Life-OS
Generates a daily summary, prioritizes tasks, tracks progress, and optionally syncs to Google Calendar.

Run standalone:
  python daily_planner.py                # Print today's plan
  python daily_planner.py --sync         # Print + sync to Google Calendar
  python daily_planner.py --log          # Log yesterday's completion and print today's plan
  python daily_planner.py --json         # Output as JSON (for Claude agent consumption)
"""

import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
SCRIPTS_DIR = Path(__file__).parent


def load_json(filename):
    filepath = DATA_DIR / filename
    if filepath.exists():
        with open(filepath) as f:
            return json.load(f)
    return {}


def save_json(filename, data):
    filepath = DATA_DIR / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


def get_active_projects():
    data = load_json("projects.json")
    return [p for p in data.get("projects", []) if p["status"] == "active"]


def get_pending_tasks():
    data = load_json("tasks.json")
    return [t for t in data.get("tasks", []) if t["status"] in ("pending", "in_progress")]


def get_recurring_tasks_for_today():
    data = load_json("tasks.json")
    today_name = datetime.now().strftime("%A").lower()
    today_tasks = []
    for rec in data.get("recurring_tasks", []):
        if rec["frequency"] == "daily":
            today_tasks.append(rec)
        elif rec["frequency"] == "weekly" and rec.get("day", "").lower() == today_name:
            today_tasks.append(rec)
    return today_tasks


def get_overdue_tasks():
    today = datetime.now().strftime("%Y-%m-%d")
    pending = get_pending_tasks()
    return [t for t in pending if t.get("due_date") and t["due_date"] < today]


def get_due_today():
    today = datetime.now().strftime("%Y-%m-%d")
    pending = get_pending_tasks()
    return [t for t in pending if t.get("due_date") == today]


def get_due_this_week():
    today = datetime.now()
    week_end = today + timedelta(days=(6 - today.weekday()))
    week_end_str = week_end.strftime("%Y-%m-%d")
    today_str = today.strftime("%Y-%m-%d")
    pending = get_pending_tasks()
    return [t for t in pending if t.get("due_date") and today_str < t["due_date"] <= week_end_str]


def get_objectives_summary():
    data = load_json("objectives.json")
    quarterly = data.get("quarterly_objectives", [])
    active = [o for o in quarterly if o["status"] == "active"]
    summary = []
    for obj in active:
        krs = obj.get("key_results", [])
        if krs:
            avg_progress = sum(kr["current"] / kr["target"] * 100 for kr in krs if kr["target"] > 0) / len(krs)
        else:
            avg_progress = 0
        summary.append({
            "title": obj["title"],
            "quarter": obj["quarter"],
            "progress": round(avg_progress, 1),
            "key_results": [
                {
                    "description": kr["description"],
                    "progress": f"{kr['current']}/{kr['target']} {kr['unit']}"
                }
                for kr in krs
            ]
        })
    return summary


def get_project_progress():
    projects = get_active_projects()
    all_tasks = load_json("tasks.json").get("tasks", [])
    result = []
    for proj in projects:
        proj_tasks = [t for t in all_tasks if t.get("project_id") == proj["id"]]
        total = len(proj_tasks)
        completed = len([t for t in proj_tasks if t["status"] == "completed"])
        objectives = proj.get("objectives", [])
        obj_summary = []
        for obj in objectives:
            krs = obj.get("key_results", [])
            if krs:
                avg = sum(kr["current"] / kr["target"] * 100 for kr in krs if kr["target"] > 0) / len(krs)
            else:
                avg = 0
            obj_summary.append({
                "title": obj["title"],
                "status": obj["status"],
                "due": obj.get("due_date", "no date"),
                "progress": round(avg, 1)
            })
        result.append({
            "name": proj["name"],
            "priority": proj["priority"],
            "tasks_completed": f"{completed}/{total}",
            "objectives": obj_summary
        })
    return result


def log_daily_completion():
    """Log what was completed yesterday for tracking."""
    log_data = load_json("daily_log.json")
    tasks_data = load_json("tasks.json")

    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    completed_yesterday = [
        t for t in tasks_data.get("tasks", [])
        if t.get("completed_at", "").startswith(yesterday)
    ]

    entry = {
        "date": yesterday,
        "tasks_completed": len(completed_yesterday),
        "tasks_details": [{"id": t["id"], "title": t["title"]} for t in completed_yesterday],
        "generated_at": datetime.now().isoformat()
    }

    log_data.setdefault("logs", []).append(entry)
    save_json("daily_log.json", log_data)
    return entry


def generate_daily_plan():
    """Generate the full daily plan."""
    today = datetime.now()
    overdue = get_overdue_tasks()
    due_today = get_due_today()
    due_week = get_due_this_week()
    recurring = get_recurring_tasks_for_today()
    objectives = get_objectives_summary()
    projects = get_project_progress()

    # Priority sort
    priority_order = {"high": 0, "medium": 1, "low": 2}
    overdue.sort(key=lambda t: priority_order.get(t.get("priority", "low"), 2))
    due_today.sort(key=lambda t: priority_order.get(t.get("priority", "low"), 2))

    plan = {
        "date": today.strftime("%Y-%m-%d"),
        "day_of_week": today.strftime("%A"),
        "summary": {
            "overdue_count": len(overdue),
            "due_today_count": len(due_today),
            "due_this_week_count": len(due_week),
            "recurring_today_count": len(recurring),
            "active_projects": len(projects)
        },
        "overdue_tasks": [
            {"id": t["id"], "title": t["title"], "priority": t["priority"],
             "due_date": t["due_date"], "project_id": t.get("project_id")}
            for t in overdue
        ],
        "todays_tasks": [
            {"id": t["id"], "title": t["title"], "priority": t["priority"],
             "estimated_minutes": t.get("estimated_minutes", 60), "project_id": t.get("project_id")}
            for t in due_today
        ],
        "recurring_today": [
            {"id": r["id"], "title": r["title"], "time": r.get("time", ""), "estimated_minutes": r.get("estimated_minutes", 30)}
            for r in recurring
        ],
        "upcoming_this_week": [
            {"id": t["id"], "title": t["title"], "priority": t["priority"],
             "due_date": t["due_date"]}
            for t in due_week
        ],
        "project_progress": projects,
        "objectives": objectives
    }

    return plan


def format_plan_text(plan):
    """Format the plan as readable text."""
    lines = []
    lines.append(f"{'='*60}")
    lines.append(f"  DAILY PLAN - {plan['day_of_week']}, {plan['date']}")
    lines.append(f"{'='*60}")

    s = plan["summary"]
    lines.append("")
    lines.append(f"  Overview: {s['due_today_count']} tasks today | "
                 f"{s['overdue_count']} overdue | "
                 f"{s['due_this_week_count']} this week | "
                 f"{s['active_projects']} active projects")

    if plan["overdue_tasks"]:
        lines.append("")
        lines.append(f"  !! OVERDUE ({len(plan['overdue_tasks'])})")
        lines.append(f"  {'-'*40}")
        for t in plan["overdue_tasks"]:
            lines.append(f"  [{t['priority'].upper()}] {t['title']} (due {t['due_date']})")

    if plan["todays_tasks"]:
        lines.append("")
        lines.append(f"  TODAY'S TASKS ({len(plan['todays_tasks'])})")
        lines.append(f"  {'-'*40}")
        total_min = 0
        for t in plan["todays_tasks"]:
            mins = t.get("estimated_minutes", 60)
            total_min += mins
            lines.append(f"  [{t['priority'].upper()}] {t['title']} (~{mins}min)")
        lines.append(f"  Total estimated time: {total_min // 60}h {total_min % 60}m")

    if plan["recurring_today"]:
        lines.append("")
        lines.append(f"  RECURRING TODAY")
        lines.append(f"  {'-'*40}")
        for r in plan["recurring_today"]:
            time_str = f" @ {r['time']}" if r.get("time") else ""
            lines.append(f"  {r['title']}{time_str} (~{r['estimated_minutes']}min)")

    if plan["upcoming_this_week"]:
        lines.append("")
        lines.append(f"  UPCOMING THIS WEEK ({len(plan['upcoming_this_week'])})")
        lines.append(f"  {'-'*40}")
        for t in plan["upcoming_this_week"]:
            lines.append(f"  [{t['priority'].upper()}] {t['title']} (due {t['due_date']})")

    if plan["project_progress"]:
        lines.append("")
        lines.append(f"  PROJECT PROGRESS")
        lines.append(f"  {'-'*40}")
        for p in plan["project_progress"]:
            lines.append(f"  {p['name']} [{p['priority'].upper()}] - Tasks: {p['tasks_completed']}")
            for obj in p.get("objectives", []):
                lines.append(f"    -> {obj['title']}: {obj['progress']}% (due {obj['due']})")

    if plan["objectives"]:
        lines.append("")
        lines.append(f"  QUARTERLY OBJECTIVES")
        lines.append(f"  {'-'*40}")
        for obj in plan["objectives"]:
            lines.append(f"  {obj['title']} ({obj['quarter']}) - {obj['progress']}%")
            for kr in obj.get("key_results", []):
                lines.append(f"    -> {kr['description']}: {kr['progress']}")

    lines.append("")
    lines.append(f"{'='*60}")
    lines.append(f"  Generated at {datetime.now().strftime('%H:%M:%S')}")
    lines.append(f"{'='*60}")

    return "\n".join(lines)


if __name__ == "__main__":
    if "--log" in sys.argv:
        entry = log_daily_completion()
        print(f"Logged {entry['tasks_completed']} completed tasks for {entry['date']}")
        print()

    plan = generate_daily_plan()

    if "--json" in sys.argv:
        print(json.dumps(plan, indent=2))
    else:
        print(format_plan_text(plan))

    if "--sync" in sys.argv:
        try:
            from gcal_sync import get_calendar_service, get_or_create_lifeos_calendar
            from gcal_sync import sync_tasks_to_calendar, push_daily_plan_to_calendar

            service = get_calendar_service()
            cal_id = get_or_create_lifeos_calendar(service)
            synced = sync_tasks_to_calendar(service, cal_id)
            push_daily_plan_to_calendar(service, cal_id, format_plan_text(plan))
            print(f"\nCalendar synced! ({synced} tasks updated)")
        except ImportError:
            print("\nGoogle API libraries not installed. Run:")
            print("  pip install google-auth google-auth-oauthlib google-api-python-client")
        except Exception as e:
            print(f"\nCalendar sync failed: {e}")
