import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { emailFooter, inSendingWindow, laneHealth, nextSendingTime, sendBlock } from '../lib/os/gigs/compliance.js';

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
