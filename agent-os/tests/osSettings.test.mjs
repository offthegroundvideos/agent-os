import test from 'node:test';
import assert from 'node:assert/strict';
import { openOsDb } from '../lib/os/db.js';
import { DEFAULT_SETTINGS, createSettings } from '../lib/os/settings.js';

test('settings fall back to defaults and persist overrides', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  assert.equal(settings.get('budget.monthly_cap_cents'), 15000);
  settings.set('budget.monthly_cap_cents', 40000);
  assert.equal(settings.get('budget.monthly_cap_cents'), 40000);
  assert.equal(DEFAULT_SETTINGS['budget.monthly_cap_cents'], 15000);
  osDb.close();
});

test('defaults are returned as copies', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  const caps = settings.get('budget.daily_tool_caps');
  caps.scrapecreators = 999;
  assert.equal(settings.get('budget.daily_tool_caps').scrapecreators, 20);
  osDb.close();
});

test('unknown keys are rejected', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  assert.throws(() => settings.get('nope'), /Unknown setting/);
  assert.throws(() => settings.set('nope', 1), /Unknown setting/);
  osDb.close();
});

test('gig engine settings start safe: drafts only, small daily numbers, four lanes', () => {
  const osDb = openOsDb(':memory:');
  const settings = createSettings(osDb);
  assert.equal(settings.get('outreach.mode'), 'draft');
  assert.equal(settings.get('outreach.daily_pitch_limit'), 15);
  assert.equal(settings.get('outreach.daily_email_limit'), 40);
  assert.deepEqual(settings.get('outreach.follow_up_days'), [4, 9]);
  assert.deepEqual(Object.keys(settings.get('gigs.lanes')), ['travel', 'winery', 'wedding', 'real_estate']);
  assert.equal(settings.get('gigs.lanes').travel.timezone, 'Pacific/Tahiti');
  assert.equal(settings.get('gigs.daily_searches'), 3);
  osDb.close();
});
