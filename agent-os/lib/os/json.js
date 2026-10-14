// lib/os/json.js
// Pulls the first JSON object or array out of a model reply. Models sometimes wrap JSON in prose or code fences.
export function extractJson(text) {
  const source = String(text ?? '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : source;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error('No JSON found in model reply.');
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
      if (depth === 0) return JSON.parse(body.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON in model reply.');
}
