// lib/os/json.js
// Pulls the first parseable JSON object or array out of a model reply. Models wrap JSON in prose, code fences,
// <think> blocks and stray brackets, so every candidate is tried until one parses.

// End index of the bracket pair opened at `start` (string/escape aware), or -1 if it never closes.
function findClose(body, start) {
  const open = body[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Walks every fenced body, then the whole reply, calling visit() with each top-level parseable value in order.
// visit() returns true to stop. After a value parses its span is skipped, so nested values aren't visited again.
function scan(text, visit) {
  const source = String(text ?? '');
  const bodies = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  bodies.push(source);
  const stats = { candidates: 0, lastError: null };
  for (const body of bodies) {
    for (let start = 0; start < body.length; start += 1) {
      if (body[start] !== '{' && body[start] !== '[') continue;
      stats.candidates += 1;
      const end = findClose(body, start);
      if (end === -1) continue;
      let value;
      try {
        value = JSON.parse(body.slice(start, end + 1));
      } catch (error) {
        stats.lastError = error;
        continue;
      }
      if (visit(value)) return stats;
      start = end;
    }
  }
  return stats;
}

export function extractJson(text) {
  let found;
  let hit = false;
  const stats = scan(text, (value) => { found = value; hit = true; return true; });
  if (hit) return found;
  if (stats.lastError) throw new Error(`Invalid JSON in model reply: ${stats.lastError.message}`, { cause: stats.lastError });
  if (stats.candidates) throw new Error('Unterminated JSON in model reply.');
  throw new Error('No JSON found in model reply.');
}

// Every top-level parseable JSON value in the reply (fenced bodies first), for callers that must pick the right one.
export function extractJsonCandidates(text) {
  const values = [];
  scan(text, (value) => { values.push(value); return false; });
  return values;
}
