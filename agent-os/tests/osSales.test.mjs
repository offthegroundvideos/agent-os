import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createGigStore } from '../lib/os/gigs/store.js';
import { createStages } from '../lib/os/gigs/stages.js';
import { createPortfolioStore } from '../lib/os/portfolio/store.js';
import { createSales, defaultIntro } from '../lib/os/sales.js';
import { createSettingsEditor } from '../lib/os/settingsEditor.js';
import { escapeHtml, renderBooking, renderLeadPage } from '../lib/os/salesPages.js';
import { isAllowedRequest } from '../lib/os/web.js';

// Monday Oct 19 2026, 8am Pacific.
const MONDAY_8AM = new Date('2026-10-19T15:00:00Z');

function setup({ busy = [], calendarFails = false } = {}) {
  let t = MONDAY_8AM.getTime();
  const clock = { now: () => new Date(t), set: (iso) => { t = Date.parse(iso); } };
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const store = createGigStore(osDb, { now: clock.now });
  const stages = createStages(osDb, { now: clock.now });
  const portfolioStore = createPortfolioStore(osDb, { now: clock.now });
  const events = [];
  const calendar = {
    async busy() { if (calendarFails) throw new Error('calendar down'); return busy; },
    async createEvent(event) { events.push(event); return { id: `evt_${events.length}`, link: '', meet: 'https://meet.google.com/x' }; },
    async cancelEvent(id) { events.push({ cancelled: id }); },
  };
  const reports = [];
  const notifier = { async report(text) { reports.push(text); } };
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otg-videos-'));
  const sales = createSales({
    osDb, settings, store, stages, portfolio: { store: portfolioStore }, calendar, notifier, videoDir, now: clock.now, log: () => {},
  });
  const { business } = store.upsertBusiness({ name: 'Silver Oak', lane: 'winery', website: 'silveroak.example' });
  const contact = store.addContact(business.id, { email: 'ana@silveroak.example', emailSourceUrl: 'https://silveroak.example' });
  const { opportunity } = store.createOpportunity(business.id);
  const { item } = portfolioStore.upsert({ source: 'site', url: 'https://madebyotg.com/work/harvest/', title: 'Harvest Film', thumbnailUrl: 'https://madebyotg.com/h.jpg' });
  stages.move(opportunity.id, 'researched', { reason: 'read', patch: { contact_id: contact.id, portfolio_ids: [item.id] } });
  stages.move(opportunity.id, 'pitched', { reason: 'sent' });
  const done = () => { osDb.close(); fs.rmSync(videoDir, { recursive: true, force: true }); };
  return { osDb, settings, store, stages, sales, events, reports, clock, id: opportunity.id, done, videoDir };
}

test('a lead page has a long random token, a default intro and only that prospect\'s work', () => {
  const ctx = setup();
  const page = ctx.sales.ensurePage(ctx.id);
  assert.match(page.token, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(ctx.sales.ensurePage(ctx.id).token, page.token, 'one page per prospect');
  assert.equal(page.intro, defaultIntro('Silver Oak'));
  const view = ctx.sales.publicPage(page.token);
  assert.equal(view.business, 'Silver Oak');
  assert.deepEqual(view.pieces.map((piece) => piece.title), ['Harvest Film']);
  assert.equal(view.video, null);
  assert.equal(ctx.sales.publicPage('short'), null);
  assert.equal(ctx.sales.publicPage('x'.repeat(24)), null);
  ctx.sales.updatePage(ctx.id, { active: false });
  assert.equal(ctx.sales.publicPage(page.token), null, 'switched-off pages disappear');
  ctx.done();
});

test('public URLs need the public address; pitches only link pages when it is set', () => {
  const ctx = setup();
  const { token } = ctx.sales.ensurePage(ctx.id);
  assert.equal(ctx.sales.publicUrl(token), '');
  ctx.settings.set('public.base_url', 'https://supawizard.tailfa9e27.ts.net:8443');
  assert.equal(ctx.sales.publicUrl(token), `https://supawizard.tailfa9e27.ts.net:8443/p/${token}`);
  ctx.done();
});

test('page views are logged once per half hour and the team hears about the first one', async () => {
  const ctx = setup();
  const { token } = ctx.sales.ensurePage(ctx.id);
  await ctx.sales.recordView(token);
  await ctx.sales.recordView(token);
  ctx.clock.set('2026-10-19T16:00:00Z');
  await ctx.sales.recordView(token);
  assert.equal(ctx.sales.pageFor(ctx.id).views, 3);
  assert.equal(ctx.sales.timeline(ctx.id).filter((row) => row.kind === 'page_viewed').length, 2);
  assert.equal(ctx.reports.length, 1);
  assert.match(ctx.reports[0], /Silver Oak just opened/);
  assert.equal(ctx.sales.recordPlay(token), true);
  assert.equal(ctx.sales.timeline(ctx.id).filter((row) => row.kind === 'video_played').length, 1);
  ctx.done();
});

test('open slots are weekday working hours after the notice period, minus busy time with a buffer', async () => {
  const ctx = setup({ busy: [{ start: '2026-10-20T17:00:00Z', end: '2026-10-20T18:00:00Z' }] }); // Tue 10-11am PT
  const slots = await ctx.sales.openSlots();
  assert.ok(slots.length > 50);
  const pacific = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  assert.ok(!slots.some((iso) => /^(Sat|Sun)/.test(pacific(iso))), 'no weekends');
  assert.ok(slots.every((iso) => Date.parse(iso) >= MONDAY_8AM.getTime() + 12 * 3_600_000), '12 hours notice');
  assert.equal(slots[0], '2026-10-20T16:00:00.000Z', 'first slot is Tuesday 9am PT');
  assert.ok(slots.includes('2026-10-20T16:30:00.000Z'), '9:30-9:50 ends right where the 10-minute buffer starts');
  assert.ok(!slots.includes('2026-10-20T17:00:00.000Z'), '10:00 is the meeting');
  assert.ok(!slots.includes('2026-10-20T18:00:00.000Z'), '11:00 is inside the buffer after the meeting');
  assert.ok(slots.includes('2026-10-20T18:30:00.000Z'), '11:30 is free after the buffer');
  assert.ok(slots.every((iso) => { const [, h] = pacific(iso).match(/(\d+):/); return Number(h) >= 9 && Number(h) < 17; }));
  ctx.done();
});

test('no calendar answer means no slots rather than double bookings', async () => {
  const ctx = setup({ calendarFails: true });
  assert.deepEqual(await ctx.sales.openSlots(), []);
  ctx.done();
});

test('booking creates the invite, the call, a touch point and a deal, moves the prospect and tells the team', async () => {
  const ctx = setup();
  ctx.settings.set('sales.closers', ['Jack', 'Swope']);
  const { token } = ctx.sales.ensurePage(ctx.id);
  const [first] = await ctx.sales.openSlots();
  const result = await ctx.sales.book(token, { start: first, name: 'Ana Ruiz', email: 'Ana@SilverOak.example', note: 'Harvest is in October' });
  assert.equal(result.closer, 'Jack');
  assert.equal(result.onCalendar, true);
  assert.equal(ctx.events[0].attendees[0].email, 'ana@silveroak.example');
  assert.match(ctx.events[0].summary, /Silver Oak/);
  assert.equal(ctx.store.getOpportunity(ctx.id).stage, 'replied');
  assert.equal(ctx.sales.deal(ctx.id).status, 'open');
  assert.equal(ctx.sales.calls()[0].guestName, 'Ana Ruiz');
  assert.ok(ctx.sales.timeline(ctx.id).some((row) => row.kind === 'call_booked'));
  assert.match(ctx.reports.at(-1), /Discovery call booked: Silver Oak/);
  assert.ok(!(await ctx.sales.openSlots()).includes(first), 'the slot is gone');
  const [next] = await ctx.sales.openSlots();
  await assert.rejects(() => ctx.sales.book(token, { start: next, name: 'Ana', email: 'ana@silveroak.example' }), /already have a call booked/);
  ctx.done();
});

test('booking refuses taken times, bad emails and missing names', async () => {
  const ctx = setup();
  const { token } = ctx.sales.ensurePage(ctx.id);
  const [first] = await ctx.sales.openSlots();
  await assert.rejects(() => ctx.sales.book(token, { start: '2026-10-25T17:00:00Z', name: 'A', email: 'a@b.example' }), /just taken/);
  await assert.rejects(() => ctx.sales.book(token, { start: 'not a date', name: 'A', email: 'a@b.example' }), /just taken/);
  await assert.rejects(() => ctx.sales.book(token, { start: first, name: 'A', email: 'nope' }), /valid email/);
  await assert.rejects(() => ctx.sales.book(token, { start: first, name: '  ', email: 'a@b.example' }), /your name/);
  await assert.rejects(() => ctx.sales.book('x'.repeat(24), { start: first, name: 'A', email: 'a@b.example' }), /no longer available/);
  ctx.done();
});

test('closers rotate; outcomes and deals are recorded as touch points', async () => {
  const ctx = setup();
  ctx.settings.set('sales.closers', ['Jack', 'Swope']);
  assert.deepEqual([ctx.sales.closers()], [['Jack', 'Swope']]);
  const { token } = ctx.sales.ensurePage(ctx.id);
  const booked = await ctx.sales.book(token, { start: (await ctx.sales.openSlots())[0], name: 'Ana', email: 'ana@silveroak.example' });
  const held = await ctx.sales.setOutcome(booked.id, { status: 'held', notes: 'Wants monthly content', actor: 'Jack' });
  assert.equal(held.status, 'held');
  await assert.rejects(() => ctx.sales.setOutcome(booked.id, { status: 'maybe' }), /Outcome must be/);
  const deal = ctx.sales.setDeal(ctx.id, { status: 'proposal_sent', monthlyCents: 250_000 }, { actor: 'Jack' });
  assert.deepEqual({ status: deal.status, monthlyCents: deal.monthlyCents }, { status: 'proposal_sent', monthlyCents: 250_000 });
  assert.throws(() => ctx.sales.setDeal(ctx.id, { status: 'maybe' }), /Deal status/);
  assert.throws(() => ctx.sales.setDeal(ctx.id, { monthlyCents: -5 }), /dollar amount/);
  const summary = ctx.sales.summary('2026-10-01T00:00:00Z');
  assert.equal(summary.callsHeld, 1);
  assert.equal(summary.proposedMonthlyCents, 250_000);
  const kinds = ctx.sales.timeline(ctx.id).map((row) => row.kind);
  assert.ok(kinds.includes('call_held') && kinds.includes('deal') && kinds.includes('stage'));
  ctx.done();
});

test('manual touch points are limited to the kinds a person logs', () => {
  const ctx = setup();
  ctx.sales.logManual(ctx.id, { kind: 'call', note: 'Left a voicemail', actor: 'Jack' });
  assert.throws(() => ctx.sales.logManual(ctx.id, { kind: 'call_booked' }), /Log one of/);
  assert.throws(() => ctx.sales.logManual('opp_missing', { kind: 'note' }), /not found/);
  assert.equal(ctx.sales.touchCounts()[ctx.id], 1);
  ctx.done();
});

test('clips are checked, stored, attached to the page, and only streamable from that page', async () => {
  const ctx = setup();
  await assert.rejects(() => ctx.sales.saveVideo(ctx.id, { bytes: Buffer.from('x'), mime: 'image/png' }), /MP4, MOV or WebM/);
  await assert.rejects(() => ctx.sales.saveVideo(ctx.id, { bytes: Buffer.alloc(0), mime: 'video/mp4' }), /empty/);
  const video = await ctx.sales.saveVideo(ctx.id, { bytes: Buffer.from('fake video'), mime: 'video/quicktime', title: 'Hello Silver Oak' });
  const { token } = ctx.sales.pageFor(ctx.id);
  assert.equal(ctx.sales.publicPage(token).video.id, video.id);
  const streamable = ctx.sales.pageVideo(token, video.id);
  assert.equal(fs.readFileSync(streamable.path, 'utf8'), 'fake video');
  assert.equal(ctx.sales.pageVideo(token, video.id + 1), null);
  assert.equal(ctx.sales.pageVideo('y'.repeat(24), video.id), null);
  ctx.done();
});

test('public HTML escapes everything a prospect or model could inject', () => {
  const page = {
    token: 'a'.repeat(24), business: '<script>x</script>', lane: 'winery', intro: 'Hi "there" & <b>you</b>',
    pieces: [{ title: '<img onerror=1>', url: 'javascript:alert(1)', thumbnailUrl: 'http://insecure/x.jpg', description: '' }],
    video: null, senderName: 'Jack Riggs',
  };
  const html = renderLeadPage(page);
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('javascript:alert'), 'only https links');
  assert.ok(!html.includes('http://insecure'), 'only https images');
  assert.match(html, /noindex/);
  const booking = renderBooking(page, ['2026-10-20T16:00:00.000Z'], { values: { name: '"><script>' } });
  assert.ok(!booking.includes('"><script>'));
  assert.equal(escapeHtml(`'`), '&#39;');
});

test('settings: public address must be a bare https origin; closers are a short list', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const editor = createSettingsEditor({ settings });
  editor.update('public.base_url', 'https://supawizard.tailfa9e27.ts.net:8443/');
  assert.equal(settings.get('public.base_url'), 'https://supawizard.tailfa9e27.ts.net:8443');
  assert.throws(() => editor.update('public.base_url', 'http://x.example'), /https/);
  assert.throws(() => editor.update('public.base_url', 'https://x.example/p'), /no path/);
  editor.update('public.base_url', '');
  editor.update('sales.closers', 'Jack, Swope, Jack');
  assert.deepEqual(settings.get('sales.closers'), ['Jack', 'Swope']);
  osDb.close();
});

test('upload access follows the proxy rule', () => {
  const req = (headers) => ({ headers: new Headers(headers) });
  assert.equal(isAllowedRequest(req({ host: '100.99.232.113:4000' }), {}), true);
  assert.equal(isAllowedRequest(req({ host: 'supawizard.tailfa9e27.ts.net' }), { AGENT_OS_API_SECRET: 'k' }), false);
  assert.equal(isAllowedRequest(req({ host: 'supawizard.tailfa9e27.ts.net', 'x-agent-os-secret': 'k' }), { AGENT_OS_API_SECRET: 'k' }), true);
});

test('pitchPostscript links the prospect page only once the public address is set', () => {
  const ctx = setup();
  assert.equal(ctx.sales.pitchPostscript(ctx.id), '');
  assert.equal(ctx.sales.pageFor(ctx.id), null, 'no page is made while pages are private');
  ctx.settings.set('public.base_url', 'https://supawizard.tailfa9e27.ts.net:8443');
  const line = ctx.sales.pitchPostscript(ctx.id);
  assert.match(line, /^P\.S\. I put together a short page for Silver Oak .*https:\/\/supawizard\.tailfa9e27\.ts\.net:8443\/p\/[A-Za-z0-9_-]{24}$/);
  assert.equal(ctx.sales.pitchPostscript(ctx.id), line, 'same page every time');
  assert.throws(() => ctx.sales.pitchPostscript('opp_missing'), /not found/);
  ctx.done();
});
