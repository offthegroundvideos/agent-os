import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuietHour, pacificDateKey, pacificDayStart, pacificParts, utcDayStart, utcMonthStart } from '../lib/os/time.js';

test('pacific parts follow daylight saving time', () => {
  assert.deepEqual(pacificParts(new Date('2026-10-14T16:30:00Z')), { year: 2026, month: 10, day: 14, hour: 9, minute: 30 });
  assert.equal(pacificParts(new Date('2026-12-15T17:00:00Z')).hour, 9);
});

test('pacific date key uses the Pacific calendar day', () => {
  assert.equal(pacificDateKey(new Date('2026-10-15T05:00:00Z')), '2026-10-14');
});

test('quiet hours wrap past midnight', () => {
  const quiet = { start: 21, end: 7 };
  assert.equal(isQuietHour(new Date('2026-10-15T05:00:00Z'), quiet), true);
  assert.equal(isQuietHour(new Date('2026-10-14T16:00:00Z'), quiet), false);
  assert.equal(isQuietHour(new Date('2026-10-14T13:59:00Z'), quiet), true);
});

test('utc month and day starts', () => {
  assert.equal(utcMonthStart(new Date('2026-10-14T16:30:00Z')), '2026-10-01T00:00:00.000Z');
  assert.equal(utcDayStart(new Date('2026-10-14T16:30:00Z')), '2026-10-14T00:00:00.000Z');
});

test('pacificDayStart is Pacific midnight in UTC, in summer and winter time', () => {
  assert.equal(pacificDayStart(new Date('2026-10-15T05:00:00Z')), '2026-10-14T07:00:00.000Z');
  assert.equal(pacificDayStart(new Date('2026-10-15T18:00:00Z')), '2026-10-15T07:00:00.000Z');
  assert.equal(pacificDayStart(new Date('2026-12-15T17:00:00Z')), '2026-12-15T08:00:00.000Z');
});
