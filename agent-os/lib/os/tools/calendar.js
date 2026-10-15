// lib/os/tools/calendar.js
// Minimal Google Calendar client for discovery-call booking. Uses the Gmail client's sign-in (calendar.events scope).
import { randomUUID } from 'node:crypto';

const API = 'https://www.googleapis.com/calendar/v3';

export function createCalendar({ accessToken, fetchImpl = fetch, calendarId = 'primary' }) {
  async function call(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) return {};
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Calendar ${method} ${path.split('?')[0]} failed: ${response.status} ${data.error?.message ?? ''}`.trim());
    return data;
  }

  const cal = () => `/calendars/${encodeURIComponent(calendarId)}`;

  // Busy blocks between two instants. All-day events block the whole day; "free" (transparent) events don't block.
  async function busy(fromIso, toIso) {
    const params = new URLSearchParams({ timeMin: fromIso, timeMax: toIso, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    const data = await call(`${cal()}/events?${params}`);
    return (data.items ?? [])
      .filter((event) => event.status !== 'cancelled' && event.transparency !== 'transparent')
      .map((event) => ({
        start: event.start?.dateTime ?? `${event.start?.date}T00:00:00-08:00`,
        end: event.end?.dateTime ?? `${event.end?.date}T00:00:00-08:00`,
      }))
      .map((block) => ({ start: new Date(block.start).toISOString(), end: new Date(block.end).toISOString() }));
  }

  // Creates the call with the guest invited and a Google Meet link.
  async function createEvent({ summary, description, start, end, attendees = [], timeZone = 'America/Los_Angeles' }) {
    const params = new URLSearchParams({ sendUpdates: 'all', conferenceDataVersion: '1' });
    const data = await call(`${cal()}/events?${params}`, {
      method: 'POST',
      body: {
        summary,
        description,
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
        attendees,
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
        reminders: { useDefault: true },
      },
    });
    return { id: data.id ?? '', link: data.htmlLink ?? '', meet: data.hangoutLink ?? '' };
  }

  async function cancelEvent(id) {
    if (!id) return;
    await call(`${cal()}/events/${encodeURIComponent(id)}?sendUpdates=all`, { method: 'DELETE' });
  }

  return { busy, createEvent, cancelEvent };
}
