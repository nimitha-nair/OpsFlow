/**
 * Lightweight fuzzy matching for client-side search. Matches when the query is
 * a substring (fast path) OR a subsequence of the text (characters appear in
 * order), so "tsk auth" loosely matches "Task: refactor auth". Case-insensitive.
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let i = 0;
  for (let c = 0; c < t.length && i < q.length; c++) {
    if (t[c] === q[i]) i++;
  }
  return i === q.length;
}

/** True when the query fuzzily matches any of the provided fields. */
export function fuzzyMatchAny(query: string, fields: (string | undefined)[]): boolean {
  const q = query.trim();
  if (!q) return true;
  return fields.some((f) => f && fuzzyMatch(q, f));
}
