# OTG-OS Sales Process v1 — Design

Date: 2026-10-15 · Owner: Jack Riggs · Builds on the Gig Engine (Plan 2) and Dashboard v1.

## Decisions (from Jack)

- **Roles:** OTG-OS is the appointment setter (finds, researches, pitches, follows up, gets the call booked). People close
  (Jack, Swope, or a later hire). Every booked call has a closer.
- **Video:** a private personal page per lead, linked from the pitch, plus short clips Jack records on his phone.
- **Booking:** built into OTG-OS, using Google Calendar (the existing token already has `calendar.events`).
- **Offer ladder:** free discovery call first, then a monthly retainer. Shoot-day packages can come later.

## The funnel

```
found → researched → pitched (email + personal page) → page viewed / clip played → discovery call booked
      → call held (closer) → retainer proposed → won / lost
```

OTG-OS owns everything up to "call booked". The closer owns the call and what follows. The existing opportunity stages
stay as they are; the sales layer adds appointments and deals on top, so the Gig Engine is untouched.

## Pieces

1. **Touch points.** A per-prospect timeline that merges what already exists (stage changes, emails drafted and sent,
   replies, ledger actions) with new events in a `touchpoints` table: page views, clip plays, bookings, and manual touches
   the closer logs (call, text, DM, in person, note). Counts show on the pipeline.
2. **Personal lead pages** at `/p/<token>`: plain server-rendered HTML (no app JavaScript), OTG branding, a short intro
   written from the research brief, the matched portfolio pieces, an optional clip, and a "Book a free 20-minute call"
   button. Tokens are long random strings; pages are `noindex`. Views and plays are logged as touch points.
3. **Clips.** Jack records or uploads a video on the prospect page (phone camera works). Stored under `data/videos/`,
   served with range requests so phones can play them, shown on the lead page.
4. **Booking** at `/p/<token>/book`: open 20-minute slots in the next 10 weekdays inside working hours, minus busy time
   from Google Calendar. Booking creates the calendar event (with the prospect invited), an appointment row, a touch point,
   moves a pitched prospect to `replied`, and alerts the team in Telegram and the dashboard.
5. **Closers.** Settings list the closers (default: the owner). Each appointment gets one (round robin). A **Calls** page
   shows upcoming and past calls with the research brief (call questions) one tap away, and an outcome form:
   held / no-show / rescheduled, notes, and "propose retainer" with a monthly amount.
6. **Deals.** `deals` rows track the retainer: closer, monthly value, status (open, proposal sent, won, lost). The weekly
   report and Today show calls booked, show rate, proposals and monthly value won.
7. **Pitch link.** When a lead page exists and a public URL is set, pitch drafts get one line with the page link.

## Public exposure

Only `/p/*` is public, through Tailscale Funnel mapped to that path. The dashboard, `/api/*` and everything else stay
tailnet-only. Public routes live outside `/api` (so `proxy.js` rules are unchanged), take no secrets, rate-limit bookings
per page, and never show other prospects' data. `public.base_url` in settings holds the Funnel URL.

## Out of scope for v1

Stripe deposits and invoices (Plan 3), automated video editing, SMS, multi-calendar routing.
