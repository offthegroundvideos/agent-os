import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTags, TAG_KEYS } from '../lib/os/portfolio/index.js';

test('parseTags maps dashboard fields to store fields like /tag does', () => {
  assert.deepEqual(TAG_KEYS, ['lane', 'style', 'type', 'location']);
  assert.deepEqual(parseTags({ lane: 'Winery', style: 'cinematic', type: 'photo_set', location: 'Napa_Valley' }).tags,
    { lane: 'winery', style: 'cinematic', deliverableType: 'photo_set', location: 'Napa Valley' });
  assert.deepEqual(parseTags({ lane: 'real_estate' }).tags, { lane: 'real_estate' });
});

test('parseTags rejects unknown keys and values, including prototype keys', () => {
  assert.match(parseTags({ lane: 'boats' }).error, /lane must be one of/);
  assert.match(parseTags({ colour: 'red' }).error, /Unknown tag colour/);
  assert.match(parseTags([['__proto__', 'x']]).error, /Unknown tag __proto__/);
});

test('parseTags lets the owner blank a free-text location', () => {
  assert.deepEqual(parseTags({ location: '' }).tags, { location: '' });
});
