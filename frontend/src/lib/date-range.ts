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
  | "overdue"
  | "next7d"
  | "next30d"
  | "next90d"
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

/** Master label for every preset, shared by the preset lists and the badge. */
export const PRESET_LABELS: Record<DateRangePreset, string> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  quarter: "Last quarter",
  "6mo": "Last 6 months",
  year: "Last year",
  overdue: "Overdue",
  next7d: "Next 7 days",
  next30d: "Next 30 days",
  next90d: "Next 90 days",
  custom: "Custom range",
};

type PresetOption = { value: DateRangePreset; label: string };
const toOptions = (values: DateRangePreset[]): PresetOption[] =>
  values.map((value) => ({ value, label: PRESET_LABELS[value] }));

/** Past-facing presets — the default for historical lists (expenses, reports). */
export const DATE_PRESETS: PresetOption[] = toOptions([
  "all",
  "today",
  "7d",
  "30d",
  "quarter",
  "6mo",
  "year",
  "custom",
]);

/** Due-date presets — upcoming windows plus Overdue, for task views sorted by
 *  due date where the work that matters is in the future. */
export const TASK_DUE_PRESETS: PresetOption[] = toOptions([
  "all",
  "overdue",
  "today",
  "next7d",
  "next30d",
  "next90d",
  "custom",
]);

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

function endOfTodayPlusDays(days: number): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + days);
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
    case "overdue":
      // Due before today: unbounded past up to the end of yesterday.
      return { preset, fromMs: null, toMs: startOfTodayMinusDays(0) - 1 };
    case "next7d":
      return { preset, fromMs: startOfTodayMinusDays(0), toMs: endOfTodayPlusDays(6) };
    case "next30d":
      return { preset, fromMs: startOfTodayMinusDays(0), toMs: endOfTodayPlusDays(29) };
    case "next90d":
      return { preset, fromMs: startOfTodayMinusDays(0), toMs: endOfTodayPlusDays(89) };
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
 * Bounds are snapped to UTC day-edges so YYYY-MM-DD backend fields compare
 * whole-day-inclusively regardless of client timezone offset.
 */
export function monthsToParams(months: number): { from: string; to: string } {
  const f = new Date(startOfTodayMinusMonths(months));
  const t = new Date(endOfToday());
  return {
    from: new Date(Date.UTC(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0, 0)).toISOString(),
    to: new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999)).toISOString(),
  };
}

/** Convert a resolved range to inclusive ISO query params for the backend.
 *  Unbounded sides are omitted so "all time" sends no params.
 *  Bounds are snapped to UTC day-edges so YYYY-MM-DD backend fields compare
 *  whole-day-inclusively regardless of client timezone offset. */
export function rangeToParams(range: DateRange): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (range.fromMs != null) {
    const d = new Date(range.fromMs);
    out.from = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0),
    ).toISOString();
  }
  if (range.toMs != null) {
    const d = new Date(range.toMs);
    out.to = new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999),
    ).toISOString();
  }
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
  overdue: "overdue",
  next7d: "next-7-days",
  next30d: "next-30-days",
  next90d: "next-90-days",
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
  return PRESET_LABELS[range.preset] ?? "All time";
}

/** Filename-safe token describing the range, for export filenames. */
export function rangeSlug(range: DateRange): string {
  if (range.preset === "custom") {
    return `${range.customStart ?? "start"}_${range.customEnd ?? "end"}`;
  }
  return PRESET_SLUGS[range.preset];
}
