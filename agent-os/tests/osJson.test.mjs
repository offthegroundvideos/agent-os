// tests/osJson.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../lib/os/json.js';

test('reads a bare object', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test('reads JSON inside prose and code fences', () => {
  assert.deepEqual(extractJson('Sure!\n```json\n{"a": [1, 2]}\n```\nDone.'), { a: [1, 2] });
  assert.deepEqual(extractJson('Here you go: [{"name": "A {B}"}] hope that helps'), [{ name: 'A {B}' }]);
});

test('ignores brackets inside strings and escaped quotes', () => {
  assert.deepEqual(extractJson('{"t": "say \\"hi\\" }", "n": {"x": 2}}'), { t: 'say "hi" }', n: { x: 2 } });
});

test('throws when there is no JSON', () => {
  assert.throws(() => extractJson('no data here'), /No JSON/);
  assert.throws(() => extractJson('{"open": 1'), /Unterminated/);
});
