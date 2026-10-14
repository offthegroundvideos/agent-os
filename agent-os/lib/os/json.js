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

export function extractJson(text) {
  const source = String(text ?? '');
  // Fenced bodies first, in order, then the whole reply.
  const bodies = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  bodies.push(source);
  let candidates = 0;
  let lastError = null;
  for (const body of bodies) {
    for (let start = 0; start < body.length; start += 1) {
      if (body[start] !== '{' && body[start] !== '[') continue;
      candidates += 1;
      const end = findClose(body, start);
      if (end === -1) continue;
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError) throw new Error(`Invalid JSON in model reply: ${lastError.message}`, { cause: lastError });
  if (candidates) throw new Error('Unterminated JSON in model reply.');
  throw new Error('No JSON found in model reply.');
}
