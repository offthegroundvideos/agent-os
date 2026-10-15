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

test('skips stray brackets and non-JSON code fences', () => {
  assert.deepEqual(extractJson('Format is {name}. Here: {"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('<think>maybe {x}</think>{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```js\nconst a=1;\n```\nResult: {"a":1}'), { a: 1 });
  const withFence = '{"body":"x ```js\\ncode\\n``` y","n":1}';
  assert.deepEqual(extractJson(withFence), JSON.parse(withFence));
});

test('reports invalid JSON and null input', () => {
  assert.throws(() => extractJson('{"a":1,}'), /Invalid JSON/);
  assert.throws(() => extractJson(null), /No JSON/);
});

test('throws when there is no JSON', () => {
  assert.throws(() => extractJson('no data here'), /No JSON/);
  assert.throws(() => extractJson('{"open": 1'), /Unterminated/);
});

test('extractJsonCandidates returns every top-level parseable value in order', async () => {
  const { extractJsonCandidates } = await import('../lib/os/json.js');
  assert.deepEqual(extractJsonCandidates('Sources [see notes]\n[{"a":1}] then {"b":2}'), [[{ a: 1 }], { b: 2 }]);
  assert.deepEqual(extractJsonCandidates('nothing here'), []);
});
