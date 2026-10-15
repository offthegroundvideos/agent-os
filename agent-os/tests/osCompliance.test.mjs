import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { emailFooter, inSendingWindow, laneHealth, nextSendingTime, resolveZone, sendBlock } from '../lib/os/gigs/compliance.js';

const TAHITI = 'Pacific/Tahiti';
const LA = 'America/Los_Angeles';

test('the footer names the sender, the business address and how to opt out', () => {
  const footer = emailFooter({ senderName: 'Jack Riggs', mailingAddress: '21 Bolinas Rd, Fairfax, CA 94930' });
  assert.match(footer, /Jack Riggs · OFF THE GROUND · madebyotg\.com/);
  assert.match(footer, /21 Bolinas Rd, Fairfax, CA 94930/);
  assert.match(footer, /Reply "unsubscribe"/);
});

test('sending window is weekdays 9-5 in the recipient time zone', () => {
  assert.equal(inSendingWindow(new Date('2026-10-14T19:00:00Z'), TAHITI), true); // Wed 09:00 Tahiti
  assert.equal(inSendingWindow(new Date('2026-10-14T18:00:00Z'), TAHITI), false); // Wed 08:00
  assert.equal(inSendingWindow(new Date('2026-10-14T16:00:00Z'), LA), true); // Wed 09:00 Pacific
  assert.equal(inSendingWindow(new Date('2026-10-18T19:00:00Z'), TAHITI), false); // Sunday
});

test('nextSendingTime finds the next opening', () => {
  const inside = new Date('2026-10-14T19:30:00Z');
  assert.equal(nextSendingTime(inside, TAHITI), inside);
  assert.equal(nextSendingTime(new Date('2026-10-14T18:05:00Z'), TAHITI).toISOString(), '2026-10-14T19:00:00.000Z');
  assert.equal(nextSendingTime(new Date('2026-10-16T03:30:00Z'), TAHITI).toISOString(), '2026-10-16T19:00:00.000Z'); // Thu 17:30 -> Fri 09:00
  assert.equal(nextSendingTime(new Date('2026-10-17T20:00:00Z'), TAHITI).toISOString(), '2026-10-19T19:00:00.000Z'); // Sat -> Mon
});

test('sendBlock enforces paused lanes and daily limits', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const counts = { all: 0, pitch: 0 };
  const store = { emailsInLast24h: ({ kind } = {}) => (kind === 'pitch' ? counts.pitch : counts.all) };
  assert.equal(sendBlock({ store, settings, lane: 'winery', kind: 'pitch' }), null);
  counts.pitch = 15;
  assert.deepEqual(sendBlock({ store, settings, lane: 'winery', kind: 'pitch' }), { reason: 'daily pitch limit reached', waitHours: 1 });
  assert.equal(sendBlock({ store, settings, lane: 'winery', kind: 'follow_up' }), null);
  counts.all = 40;
  assert.equal(sendBlock({ store, settings, lane: 'winery', kind: 'follow_up' }).reason, 'daily email limit reached');
  settings.set('outreach.paused_lanes', { winery: 'bounce rate 8%' });
  assert.deepEqual(sendBlock({ store, settings, lane: 'winery', kind: 'follow_up' }), { reason: 'winery outreach is paused: bounce rate 8%', waitHours: 6 });
  osDb.close();
});

test('laneHealth pauses on high bounce or unsubscribe rates once there is enough data', () => {
  assert.equal(laneHealth({ sends: 9, bounces: 5, unsubscribes: 0 }), null);
  assert.equal(laneHealth({ sends: 20, bounces: 2, unsubscribes: 0 }), 'bounce rate 10% over the last 20 sends');
  assert.equal(laneHealth({ sends: 50, bounces: 2, unsubscribes: 2 }), 'unsubscribe rate 4% over the last 50 sends');
  assert.equal(laneHealth({ sends: 50, bounces: 2, unsubscribes: 1 }), null);
});

test('resolveZone falls back to the home zone for bad input', () => {
  assert.equal(resolveZone(TAHITI), TAHITI);
  assert.equal(resolveZone('Mars/Phobos'), LA);
  assert.equal(resolveZone(''), LA);
  assert.equal(resolveZone(undefined), LA);
  assert.equal(resolveZone(42), LA);
});

test('an invalid zone behaves like America/Los_Angeles', () => {
  assert.equal(inSendingWindow(new Date('2026-10-14T16:00:00Z'), 'Mars/Phobos'), true);
  assert.equal(inSendingWindow(new Date('2026-10-14T15:00:00Z'), 'Mars/Phobos'), false);
  assert.equal(nextSendingTime(new Date('2026-10-14T15:00:00Z'), 'Mars/Phobos').toISOString(), '2026-10-14T16:00:00.000Z');
});

test('half-hour offset zones open at the right instant', () => {
  assert.equal(inSendingWindow(new Date('2026-10-14T03:30:00Z'), 'Asia/Kolkata'), true);
  assert.equal(inSendingWindow(new Date('2026-10-14T03:15:00Z'), 'Asia/Kolkata'), false);
  assert.equal(nextSendingTime(new Date('2026-10-14T18:00:00Z'), 'Pacific/Marquesas').toISOString(), '2026-10-14T18:30:00.000Z');
});

test('daylight saving changes keep the window at local 9-5', () => {
  assert.equal(nextSendingTime(new Date('2026-03-06T01:30:00Z'), LA).toISOString(), '2026-03-06T17:00:00.000Z');
  assert.equal(nextSendingTime(new Date('2026-10-31T20:00:00Z'), LA).toISOString(), '2026-11-02T17:00:00.000Z');
  // After spring-forward (Mar 8) 09:00 PDT is 16:00Z.
  assert.equal(nextSendingTime(new Date('2026-03-08T20:00:00Z'), LA).toISOString(), '2026-03-09T16:00:00.000Z');
});

test('window boundaries: 16:59 is inside, 17:00 is outside', () => {
  assert.equal(inSendingWindow(new Date('2026-10-15T23:59:00Z'), LA), true); // Thu 16:59 PDT
  assert.equal(inSendingWindow(new Date('2026-10-16T00:00:00Z'), LA), false); // Thu 17:00 PDT
});

test('a malformed window falls back to 9-5', () => {
  const nine = new Date('2026-10-14T16:00:00Z'); // 09:00 PDT
  const eight = new Date('2026-10-14T15:00:00Z'); // 08:00 PDT
  for (const bad of [{ startHour: 17, endHour: 9 }, { startHour: 9, endHour: 9 }, { startHour: -1, endHour: 17 }, { startHour: 9, endHour: 25 }, { startHour: 9.5, endHour: 17 }, { startHour: '9', endHour: '17' }, null]) {
    assert.equal(inSendingWindow(nine, LA, bad), true);
    assert.equal(inSendingWindow(eight, LA, bad), false);
    assert.equal(nextSendingTime(eight, LA, bad).toISOString(), '2026-10-14T16:00:00.000Z');
  }
  assert.equal(inSendingWindow(eight, LA, { startHour: 8, endHour: 17 }), true);
});

test('the footer refuses a blank address or sender name', () => {
  assert.throws(() => emailFooter({ senderName: 'Jack Riggs', mailingAddress: '   ' }), /A business mailing address is required in outreach emails\./);
  assert.throws(() => emailFooter({ senderName: 'Jack Riggs' }), /mailing address is required/);
  assert.throws(() => emailFooter({ senderName: ' ', mailingAddress: '21 Bolinas Rd' }), /A sender name is required in outreach emails\./);
});

test('sendBlock tolerates a null paused_lanes setting', () => {
  const settings = { get: (key) => ({ 'outreach.paused_lanes': null, 'outreach.daily_pitch_limit': 15, 'outreach.daily_email_limit': 40 })[key] };
  const store = { emailsInLast24h: () => 0 };
  assert.equal(sendBlock({ store, settings, lane: 'winery', kind: 'pitch' }), null);
  const paused = { get: (key) => ({ 'outreach.paused_lanes': { winery: 123 } })[key] };
  assert.equal(sendBlock({ store, settings: paused, lane: 'winery', kind: 'pitch' }).reason, 'winery outreach is paused: 123');
});
