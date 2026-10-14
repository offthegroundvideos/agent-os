export function editDistance(a = '', b = '') {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

export function editRatio(draft = '', sent = '') {
  if (!draft.length) return sent.length ? 1 : 0;
  return Math.min(1, Math.round((editDistance(draft, sent) / draft.length) * 1000) / 1000);
}
