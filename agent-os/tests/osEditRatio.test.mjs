import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, editRatio } from '../lib/os/editRatio.js';

test('edit distance counts insertions, deletions and substitutions', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3);
  assert.equal(editDistance('', 'abc'), 3);
  assert.equal(editDistance('same', 'same'), 0);
});

test('edit ratio is distance over draft length, capped at 1', () => {
  assert.equal(editRatio('hello world', 'hello world'), 0);
  assert.equal(editRatio('abcd', 'abxd'), 0.25);
  assert.equal(editRatio('', 'anything'), 1);
  assert.equal(editRatio('', ''), 0);
  assert.equal(editRatio('ab', 'completely different'), 1);
});
