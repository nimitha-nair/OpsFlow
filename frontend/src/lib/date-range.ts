/**
 * Shared date-range model for the global date filter. Presets resolve to
 * inclusive epoch-ms bounds (relative to "now" at selection time) so any list
 * or derived metric can be filtered client-side with a single predicate.
 */

export type DateRangePreset =
  | "all"
  | "today"
  | "7d"
  | "30d"
  | "quarter"
  | "6mo"
  | "year"
  | "custom";

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive lower bound (epoch ms), or null for unbounded. */
  fromMs: number | null;
  /** Inclusive upper bound (epoch ms), or null for unbounded. */
  toMs: number | null;
  /** yyyy-mm-dd values preserved for the custom-range inputs. */
  customStart?: string;
  customEnd?: string;
}

export const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "Last quarter" },
  { value: "6mo", label: "Last 6 months" },
  { value: "year", label: "Last year" },
  { value: "custom", label: "Custom range" },
];

function endOfToday(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfTodayMinusDays(days: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.getTime();
}

function startOfTodayMinusMonths(months: number): number {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Build a resolved {@link DateRange} from a preset (+ optional custom dates). */
export function makeRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
): DateRange {
  switch (preset) {
    case "today":
      return { preset, fromMs: startOfTodayMinusDays(0), toMs: endOfToday() };
    case "7d":
      return { preset, fromMs: startOfTodayMinusDays(6), toMs: endOfToday() };
    case "30d":
      return { preset, fromMs: startOfTodayMinusDays(29), toMs: endOfToday() };
    case "quarter":
      return { preset, fromMs: startOfTodayMinusMonths(3), toMs: endOfToday() };
    case "6mo":
      return { preset, fromMs: startOfTodayMinusMonths(6), toMs: endOfToday() };
    case "year":
      return { preset, fromMs: startOfTodayMinusMonths(12), toMs: endOfToday() };
    case "custom": {
      const f = customStart ? Date.parse(`${customStart}T00:00:00`) : NaN;
      const t = customEnd ? Date.parse(`${customEnd}T23:59:59.999`) : NaN;
      return {
        preset,
        fromMs: Number.isNaN(f) ? null : f,
        toMs: Number.isNaN(t) ? null : t,
        customStart,
        customEnd,
      };
    }
    case "all":
    default:
      return { preset: "all", fromMs: null, toMs: null };
  }
}

/** Whether a date value falls inside the range (unbounded ⇒ always true). */
export function inRange(
  value: string | number | Date | null | undefined,
  range: DateRange,
): boolean {
  if (range.fromMs == null && range.toMs == null) return true;
  const t =
    value == null
      ? NaN
      : value instanceof Date
        ? value.getTime()
        : typeof value === "number"
          ? value
          : Date.parse(value);
  if (Number.isNaN(t)) return false;
  if (range.fromMs != null && t < range.fromMs) return false;
  if (range.toMs != null && t > range.toMs) return false;
  return true;
}

/** Filter a list by a date accessor; returns the same array when unbounded. */
export function filterByDate<T>(
  items: T[],
  getDate: (item: T) => string | number | Date | null | undefined,
  range: DateRange,
): T[] {
  if (range.fromMs == null && range.toMs == null) return items;
  return items.filter((i) => inRange(getDate(i), range));
}

/**
 * Approximate the range as a whole number of months, for backend endpoints that
 * are still month-bound (e.g. the expenses/AI reports). Clamped to [1, 24].
 */
export function rangeToMonths(range: DateRange): number {
  if (range.fromMs == null) return 24;
  const months = Math.ceil((Date.now() - range.fromMs) / (1000 * 60 * 60 * 24 * 30));
  return Math.min(24, Math.max(1, months));
}

/**
 * Convert a trailing month count to inclusive ISO query params for the backend.
 * Returns a closed {from, to} window of `months` whole months ending today.
 */
export function monthsToParams(months: number): { from: string; to: string } {
  return {
    from: new Date(startOfTodayMinusMonths(months)).toISOString(),
    to: new Date(endOfToday()).toISOString(),
  };
}

/** Convert a resolved range to inclusive ISO query params for the backend.
 *  Unbounded sides are omitted so "all time" sends no params. */
export function rangeToParams(range: DateRange): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (range.fromMs != null) out.from = new Date(range.fromMs).toISOString();
  if (range.toMs != null) out.to = new Date(range.toMs).toISOString();
  return out;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a yyyy-mm-dd string as "D Mon YYYY" without timezone surprises. */
function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11 || !d) return ymd;
  return `${Number(d)} ${MONTHS[mi]} ${y}`;
}

const PRESET_SLUGS: Record<DateRangePreset, string> = {
  all: "all-time",
  today: "today",
  "7d": "last-7-days",
  "30d": "last-30-days",
  quarter: "last-quarter",
  "6mo": "last-6-months",
  year: "last-year",
  custom: "custom",
};

/** Human label for the active range (for the always-visible range badge). */
export function rangeLabel(range: DateRange): string {
  if (range.preset === "custom") {
    if (range.customStart && range.customEnd) {
      return `${fmtYmd(range.customStart)} – ${fmtYmd(range.customEnd)}`;
    }
    if (range.customStart) return `From ${fmtYmd(range.customStart)}`;
    if (range.customEnd) return `Until ${fmtYmd(range.customEnd)}`;
    return "Custom range";
  }
  return DATE_PRESETS.find((p) => p.value === range.preset)?.label ?? "All time";
}

/** Filename-safe token describing the range, for export filenames. */
export function rangeSlug(range: DateRange): string {
  if (range.preset === "custom") {
    return `${range.customStart ?? "start"}_${range.customEnd ?? "end"}`;
  }
  return PRESET_SLUGS[range.preset];
}
