import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { createSettings } from '../lib/os/settings.js';
import { createSettingsEditor, EDITABLE_SETTINGS, OUTREACH_MODES } from '../lib/os/settingsEditor.js';

function setup() {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  return { osDb, settings, editor: createSettingsEditor({ settings }) };
}

test('every editable key is a real setting and values() reads them all', () => {
  const { osDb, editor } = setup();
  const values = editor.values();
  assert.deepEqual(Object.keys(values), Object.keys(EDITABLE_SETTINGS));
  assert.equal(values['outreach.mode'], 'draft');
  assert.equal(values['goals.monthly_shoot_days'], 12);
  osDb.close();
});

test('outreach mode accepts only the /mode values', () => {
  const { osDb, settings, editor } = setup();
  assert.deepEqual(OUTREACH_MODES, ['draft', 'send']);
  editor.update('outreach.mode', 'send');
  assert.equal(settings.get('outreach.mode'), 'send');
  assert.throws(() => editor.update('outreach.mode', 'blast'), /draft or send/);
  assert.equal(settings.get('outreach.mode'), 'send');
  osDb.close();
});

test('limits must be whole numbers in range; numeric strings from forms are accepted', () => {
  const { osDb, settings, editor } = setup();
  editor.update('outreach.daily_pitch_limit', '20');
  assert.equal(settings.get('outreach.daily_pitch_limit'), 20);
  assert.throws(() => editor.update('outreach.daily_pitch_limit', 2.5), /whole number from 0 to 100/);
  assert.throws(() => editor.update('outreach.daily_email_limit', 500), /0 to 200/);
  assert.throws(() => editor.update('gigs.daily_research', -1), /0 to 100/);
  assert.throws(() => editor.update('gigs.daily_searches', ''), /whole number/);
  editor.update('gigs.daily_searches', 5);
  assert.equal(settings.get('gigs.daily_searches'), 5);
  osDb.close();
});

test('follow-up days must go up; hour ranges must be in order (quiet hours may wrap)', () => {
  const { osDb, settings, editor } = setup();
  editor.update('outreach.follow_up_days', [3, 8, 14]);
  assert.deepEqual(settings.get('outreach.follow_up_days'), [3, 8, 14]);
  editor.update('outreach.follow_up_days', []);
  assert.throws(() => editor.update('outreach.follow_up_days', [9, 4]), /go up/);
  assert.throws(() => editor.update('outreach.follow_up_days', 4), /list/);
  editor.update('outreach.window', { startHour: 8, endHour: 18 });
  assert.deepEqual(settings.get('outreach.window'), { startHour: 8, endHour: 18 });
  assert.throws(() => editor.update('outreach.window', { startHour: 18, endHour: 8 }), /end after it starts/);
  editor.update('telegram.quiet_hours', { start: 22, end: 6 });
  assert.deepEqual(settings.get('telegram.quiet_hours'), { start: 22, end: 6 });
  assert.throws(() => editor.update('telegram.quiet_hours', { start: 5, end: 5 }), /end after it starts/);
  osDb.close();
});

test('internal settings cannot be changed from the dashboard', () => {
  const { osDb, editor } = setup();
  assert.throws(() => editor.update('telegram.update_offset', 0), /can't be changed/);
  assert.throws(() => editor.update('budget.monthly_cap_cents', 99999), /can't be changed/);
  assert.throws(() => editor.update('os.paused', true), /can't be changed/);
  osDb.close();
});

test('updateLane switches a lane on or off and replaces its queries', () => {
  const { osDb, settings, editor } = setup();
  editor.updateLane('winery', { active: false });
  assert.equal(settings.get('gigs.lanes').winery.active, false);
  assert.equal(settings.get('gigs.lanes').travel.active, true);
  editor.updateLane('winery', { queries: [' Napa wineries ', '', 'Sonoma wineries'] });
  assert.deepEqual(settings.get('gigs.lanes').winery.queries, ['Napa wineries', 'Sonoma wineries']);
  assert.equal(settings.get('gigs.lanes').winery.label, 'Wineries');
  assert.throws(() => editor.updateLane('boats', { active: true }), /Lanes are/);
  assert.throws(() => editor.updateLane('winery', { queries: ['  '] }), /at least one/);
  assert.throws(() => editor.updateLane('winery', { active: 'yes' }), /true or false/);
  osDb.close();
});
