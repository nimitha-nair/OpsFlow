/**
 * Single source of truth for month-bucket labels on trend charts. Previously
 * several copies of a `monthLabel` helper rendered "Jun 2026" on every column,
 * which crowded the axis. The smart rule here: render a short month ("Jun") and
 * append a compact year ("Jun '26") ONLY when the year changes from the previous
 * bucket (or it's the first bucket), so a multi-year trend shows the year a
 * couple of times instead of on all 24 columns. Tooltips use the full label.
 */

/** Parse a "YYYY-MM" key into a Date at the first of that month (or null). */
function parseMonthKey(key: string): Date | null {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return new Date(y, m - 1, 1);
}

/** "YYYY-MM" → short month, e.g. "Jun". Falls back to the raw key. */
export function monthShort(key: string): string {
  const d = parseMonthKey(key);
  return d ? d.toLocaleString("en-US", { month: "short" }) : key;
}

/** "YYYY-MM" → full month + year, e.g. "June 2026" (used for tooltips). */
export function monthFull(key: string): string {
  const d = parseMonthKey(key);
  return d
    ? d.toLocaleString("en-US", { month: "long", year: "numeric" })
    : key;
}

/**
 * Axis label for a trend column: short month, with a compact "'YY" suffix only
 * at year boundaries (the first bucket, or whenever the year differs from
 * `prevKey`). Keeps months distinct across years without repeating the year on
 * every column.
 */
export function monthAxisLabel(key: string, prevKey?: string): string {
  const d = parseMonthKey(key);
  if (!d) return key;
  const short = d.toLocaleString("en-US", { month: "short" });
  const prevYear = prevKey ? parseMonthKey(prevKey)?.getFullYear() : undefined;
  const showYear = prevYear === undefined || prevYear !== d.getFullYear();
  return showYear ? `${short} ’${String(d.getFullYear()).slice(-2)}` : short;
}

/**
 * Map an ordered list of "YYYY-MM" keys to boundary-aware axis labels in one
 * pass (each label compares against the previous key). Convenience for callers
 * that build chart items from a key list.
 */
export function monthAxisLabels(keys: string[]): string[] {
  return keys.map((k, i) => monthAxisLabel(k, i > 0 ? keys[i - 1] : undefined));
}
