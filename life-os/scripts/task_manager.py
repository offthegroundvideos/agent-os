"""
Task Manager CLI for Life-OS
Quick commands to manage tasks and projects from the command line.

Usage:
  python task_manager.py add "Task title" --project proj_001 --priority high --due 2026-04-05
  python task_manager.py complete task_001
  python task_manager.py list
  python task_manager.py list --project proj_001
  python task_manager.py progress proj_001 obj_001 kr_001 50
"""

import json
import sys
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename):
    filepath = DATA_DIR / filename
    with open(filepath) as f:
        return json.load(f)


def save_json(filename, data):
    filepath = DATA_DIR / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


def next_id(prefix, items):
    nums = []
    for item in items:
        try:
            nums.append(int(item["id"].split("_")[1]))
        except (IndexError, ValueError):
            pass
    return f"{prefix}_{(max(nums) + 1 if nums else 1):03d}"


def add_task(title, project_id=None, priority="medium", due_date=None, estimated_minutes=60, tags=None):
    data = load_json("tasks.json")
    task_id = next_id("task", data["tasks"])
    task = {
        "id": task_id,
        "title": title,
        "project_id": project_id,
        "status": "pending",
        "priority": priority,
        "due_date": due_date,
        "estimated_minutes": estimated_minutes,
        "tags": tags or [],
        "recurrence": None,
        "calendar_event_id": None,
        "created_at": datetime.now().strftime("%Y-%m-%d"),
        "completed_at": None
    }
    data["tasks"].append(task)
    save_json("tasks.json", data)
    print(f"Created task {task_id}: {title}")
    return task


def complete_task(task_id):
    data = load_json("tasks.json")
    for task in data["tasks"]:
        if task["id"] == task_id:
            task["status"] = "completed"
            task["completed_at"] = datetime.now().isoformat()
            save_json("tasks.json", data)
            print(f"Completed: {task['title']}")
            return
    print(f"Task {task_id} not found")


def start_task(task_id):
    data = load_json("tasks.json")
    for task in data["tasks"]:
        if task["id"] == task_id:
            task["status"] = "in_progress"
            save_json("tasks.json", data)
            print(f"Started: {task['title']}")
            return
    print(f"Task {task_id} not found")


def list_tasks(project_id=None, status=None):
    data = load_json("tasks.json")
    tasks = data["tasks"]
    if project_id:
        tasks = [t for t in tasks if t.get("project_id") == project_id]
    if status:
        tasks = [t for t in tasks if t["status"] == status]

    priority_order = {"high": 0, "medium": 1, "low": 2}
    tasks.sort(key=lambda t: (priority_order.get(t.get("priority", "low"), 2), t.get("due_date", "9999")))

    for t in tasks:
        status_icon = {"pending": " ", "in_progress": ">", "completed": "x"}[t["status"]]
        due = f" (due {t['due_date']})" if t.get("due_date") else ""
        print(f"  [{status_icon}] {t['id']} [{t['priority'].upper():6s}] {t['title']}{due}")


def update_progress(project_id, objective_id, kr_id, value):
    data = load_json("projects.json")
    for proj in data["projects"]:
        if proj["id"] == project_id:
            for obj in proj.get("objectives", []):
                if obj["id"] == objective_id:
                    for kr in obj.get("key_results", []):
                        if kr.get("description", "").startswith(kr_id) or f"kr_{kr_id}" == kr_id:
                            kr["current"] = float(value)
                            save_json("projects.json", data)
                            print(f"Updated: {kr['description']} -> {value}/{kr['target']} {kr['unit']}")
                            return
    print("Key result not found")


def add_project(name, priority="medium", description=""):
    data = load_json("projects.json")
    proj_id = next_id("proj", data["projects"])
    project = {
        "id": proj_id,
        "name": name,
        "status": "active",
        "priority": priority,
        "description": description,
        "objectives": [],
        "tags": [],
        "created_at": datetime.now().strftime("%Y-%m-%d"),
        "updated_at": datetime.now().strftime("%Y-%m-%d")
    }
    data["projects"].append(project)
    save_json("projects.json", data)
    print(f"Created project {proj_id}: {name}")
    return project


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print('  task_manager.py add "title" [--project ID] [--priority high|medium|low] [--due YYYY-MM-DD]')
        print("  task_manager.py complete TASK_ID")
        print("  task_manager.py start TASK_ID")
        print("  task_manager.py list [--project ID] [--status pending|in_progress|completed]")
        print('  task_manager.py add-project "name" [--priority high|medium|low]')
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "add":
        title = sys.argv[2]
        kwargs = {}
        args = sys.argv[3:]
        i = 0
        while i < len(args):
            if args[i] == "--project":
                kwargs["project_id"] = args[i + 1]; i += 2
            elif args[i] == "--priority":
                kwargs["priority"] = args[i + 1]; i += 2
            elif args[i] == "--due":
                kwargs["due_date"] = args[i + 1]; i += 2
            elif args[i] == "--time":
                kwargs["estimated_minutes"] = int(args[i + 1]); i += 2
            else:
                i += 1
        add_task(title, **kwargs)

    elif cmd == "complete":
        complete_task(sys.argv[2])

    elif cmd == "start":
        start_task(sys.argv[2])

    elif cmd == "list":
        kwargs = {}
        args = sys.argv[2:]
        i = 0
        while i < len(args):
            if args[i] == "--project":
                kwargs["project_id"] = args[i + 1]; i += 2
            elif args[i] == "--status":
                kwargs["status"] = args[i + 1]; i += 2
            else:
                i += 1
        list_tasks(**kwargs)

    elif cmd == "add-project":
        name = sys.argv[2]
        priority = "medium"
        args = sys.argv[3:]
        i = 0
        while i < len(args):
            if args[i] == "--priority":
                priority = args[i + 1]; i += 2
            else:
                i += 1
        add_project(name, priority)

    elif cmd == "progress":
        update_progress(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])

    else:
        print(f"Unknown command: {cmd}")
