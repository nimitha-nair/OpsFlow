/** Best-effort epoch-ms from a string, number, Date, or Firestore Timestamp. */
export function toMillis(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  if (typeof value === "object") {
    const v = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v._seconds === "number") return v._seconds * 1000;
  }
  return NaN;
}

/** Inclusive range test. Unbounded ⇒ true; unparseable/out-of-range ⇒ false. */
export function withinIsoRange(
  value: unknown,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  const t = toMillis(value);
  if (Number.isNaN(t)) return false;
  if (from) {
    const f = Date.parse(from);
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (to) {
    const e = Date.parse(to);
    if (!Number.isNaN(e) && t > e) return false;
  }
  return true;
}

/** Filter a list by a date accessor; same-array fast path when unbounded. */
export function filterByDateWindow<T>(
  items: T[],
  getDate: (item: T) => unknown,
  from?: string,
  to?: string,
): T[] {
  if (!from && !to) return items;
  return items.filter((i) => withinIsoRange(getDate(i), from, to));
}
