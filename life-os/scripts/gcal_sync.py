"""
Google Calendar Sync for Life-OS
Syncs tasks and daily plans to Google Calendar.

SETUP:
1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable "Google Calendar API" in APIs & Services > Library
4. Go to APIs & Services > Credentials
5. Click "Create Credentials" > "OAuth 2.0 Client ID"
6. Application type: "Desktop app"
7. Download the JSON file and save it as:
   c:/AI-Agents/life-os/credentials.json
8. Run this script once manually to authorize:
   python c:/AI-Agents/life-os/scripts/gcal_sync.py --auth
9. A browser window will open - sign in and grant access
10. The token will be saved to c:/AI-Agents/life-os/token.json
"""

import json
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
CREDENTIALS_FILE = BASE_DIR / "credentials.json"
TOKEN_FILE = BASE_DIR / "token.json"

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    GOOGLE_AVAILABLE = True
except ImportError:
    GOOGLE_AVAILABLE = False

SCOPES = ["https://www.googleapis.com/auth/calendar"]


def check_dependencies():
    if not GOOGLE_AVAILABLE:
        print("ERROR: Google API libraries not installed.")
        print("Run: pip install google-auth google-auth-oauthlib google-api-python-client")
        sys.exit(1)


def authenticate():
    """Handle OAuth2 authentication flow."""
    check_dependencies()
    creds = None

    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                print(f"ERROR: {CREDENTIALS_FILE} not found.")
                print("Download OAuth credentials from Google Cloud Console.")
                print("See setup instructions at the top of this file.")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
        print("Authentication successful! Token saved.")

    return creds


def get_calendar_service():
    creds = authenticate()
    return build("calendar", "v3", credentials=creds)


def get_or_create_lifeos_calendar(service):
    """Get or create a 'Life-OS' calendar."""
    calendars = service.calendarList().list().execute()
    for cal in calendars.get("items", []):
        if cal["summary"] == "Life-OS":
            return cal["id"]

    new_cal = service.calendars().insert(body={
        "summary": "Life-OS",
        "description": "Managed by Life-OS daily planner",
        "timeZone": "America/New_York"  # Change to your timezone
    }).execute()
    print(f"Created 'Life-OS' calendar: {new_cal['id']}")
    return new_cal["id"]


def sync_tasks_to_calendar(service, calendar_id):
    """Sync pending tasks with due dates to Google Calendar."""
    tasks_file = DATA_DIR / "tasks.json"
    with open(tasks_file) as f:
        data = json.load(f)

    synced = 0
    for task in data["tasks"]:
        if task["status"] == "completed":
            continue
        if not task.get("due_date"):
            continue
        if task.get("calendar_event_id"):
            # Already synced - update it
            try:
                event = service.events().get(
                    calendarId=calendar_id,
                    eventId=task["calendar_event_id"]
                ).execute()
                event["summary"] = f"[{task['priority'].upper()}] {task['title']}"
                service.events().update(
                    calendarId=calendar_id,
                    eventId=task["calendar_event_id"],
                    body=event
                ).execute()
                synced += 1
            except Exception:
                task["calendar_event_id"] = None  # Re-create if missing
                continue

        if not task.get("calendar_event_id"):
            # Create new event
            due = datetime.strptime(task["due_date"], "%Y-%m-%d")
            duration = task.get("estimated_minutes", 60)
            event_body = {
                "summary": f"[{task['priority'].upper()}] {task['title']}",
                "description": f"Project: {task.get('project_id', 'none')}\nLife-OS Task ID: {task['id']}",
                "start": {
                    "dateTime": due.replace(hour=9).isoformat(),
                    "timeZone": "America/New_York",
                },
                "end": {
                    "dateTime": (due.replace(hour=9) + timedelta(minutes=duration)).isoformat(),
                    "timeZone": "America/New_York",
                },
                "colorId": "11" if task["priority"] == "high" else "7",
                "reminders": {
                    "useDefault": False,
                    "overrides": [
                        {"method": "popup", "minutes": 30},
                    ],
                },
            }
            event = service.events().insert(calendarId=calendar_id, body=event_body).execute()
            task["calendar_event_id"] = event["id"]
            synced += 1

    # Write back updated task IDs
    with open(tasks_file, "w") as f:
        json.dump(data, f, indent=2)

    return synced


def sync_recurring_to_calendar(service, calendar_id):
    """Sync recurring tasks as recurring calendar events."""
    tasks_file = DATA_DIR / "tasks.json"
    with open(tasks_file) as f:
        data = json.load(f)

    for rec in data.get("recurring_tasks", []):
        if not rec.get("auto_calendar", False):
            continue

        day_map = {
            "monday": "MO", "tuesday": "TU", "wednesday": "WE",
            "thursday": "TH", "friday": "FR", "saturday": "SA", "sunday": "SU"
        }

        freq = rec["frequency"].upper()
        byday = day_map.get(rec.get("day", "").lower(), "MO")
        time_parts = rec.get("time", "09:00").split(":")
        hour, minute = int(time_parts[0]), int(time_parts[1])

        start = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
        if start < datetime.now():
            start += timedelta(days=1)

        duration = rec.get("estimated_minutes", 30)

        event_body = {
            "summary": rec["title"],
            "description": f"Life-OS Recurring Task: {rec['id']}",
            "start": {
                "dateTime": start.isoformat(),
                "timeZone": "America/New_York",
            },
            "end": {
                "dateTime": (start + timedelta(minutes=duration)).isoformat(),
                "timeZone": "America/New_York",
            },
            "recurrence": [f"RRULE:FREQ={freq};BYDAY={byday}"],
        }

        # Check if already exists
        events = service.events().list(
            calendarId=calendar_id,
            q=f"Life-OS Recurring Task: {rec['id']}",
            maxResults=1
        ).execute()

        if not events.get("items"):
            service.events().insert(calendarId=calendar_id, body=event_body).execute()
            print(f"  Created recurring event: {rec['title']}")


def push_daily_plan_to_calendar(service, calendar_id, plan):
    """Push a daily plan summary as an all-day event."""
    today = datetime.now().strftime("%Y-%m-%d")

    # Check if today's plan event already exists
    events = service.events().list(
        calendarId=calendar_id,
        timeMin=f"{today}T00:00:00Z",
        timeMax=f"{today}T23:59:59Z",
        q="Daily Plan",
        maxResults=1
    ).execute()

    summary = f"Daily Plan - {today}"
    description = plan

    if events.get("items"):
        event = events["items"][0]
        event["description"] = description
        service.events().update(
            calendarId=calendar_id,
            eventId=event["id"],
            body=event
        ).execute()
    else:
        event_body = {
            "summary": summary,
            "description": description,
            "start": {"date": today},
            "end": {"date": today},
            "colorId": "9",
        }
        service.events().insert(calendarId=calendar_id, body=event_body).execute()


def get_todays_events(service):
    """Fetch today's events from all calendars."""
    now = datetime.now()
    start = now.replace(hour=0, minute=0, second=0).isoformat() + "Z"
    end = now.replace(hour=23, minute=59, second=59).isoformat() + "Z"

    events = service.events().list(
        calendarId="primary",
        timeMin=start,
        timeMax=end,
        singleEvents=True,
        orderBy="startTime"
    ).execute()

    return events.get("items", [])


def full_sync():
    """Run a full sync: tasks -> calendar, fetch today's events."""
    print(f"[{datetime.now().isoformat()}] Starting Life-OS Calendar Sync...")

    service = get_calendar_service()
    calendar_id = get_or_create_lifeos_calendar(service)

    synced = sync_tasks_to_calendar(service, calendar_id)
    print(f"  Synced {synced} tasks to calendar")

    sync_recurring_to_calendar(service, calendar_id)

    events = get_todays_events(service)
    print(f"  Found {len(events)} events today")

    return {
        "tasks_synced": synced,
        "todays_events": [
            {
                "summary": e.get("summary", ""),
                "start": e.get("start", {}).get("dateTime", e.get("start", {}).get("date", "")),
                "end": e.get("end", {}).get("dateTime", e.get("end", {}).get("date", "")),
            }
            for e in events
        ]
    }


if __name__ == "__main__":
    if "--auth" in sys.argv:
        check_dependencies()
        authenticate()
        print("Ready to sync!")
    elif "--sync" in sys.argv:
        result = full_sync()
        print(json.dumps(result, indent=2))
    elif "--events" in sys.argv:
        check_dependencies()
        service = get_calendar_service()
        events = get_todays_events(service)
        for e in events:
            start = e.get("start", {}).get("dateTime", e.get("start", {}).get("date", ""))
            print(f"  {start} - {e.get('summary', 'No title')}")
    else:
        print("Usage:")
        print("  python gcal_sync.py --auth    # First-time authentication")
        print("  python gcal_sync.py --sync    # Sync tasks to calendar")
        print("  python gcal_sync.py --events  # Show today's events")
