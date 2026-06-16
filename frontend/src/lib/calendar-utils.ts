/** Local YYYY-MM-DD key for a date (matches the task dueDate format). */
export function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, n: number): Date {
  const x = new Date(date);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + n, 1);
}

/** Start of the week (Sunday) at 00:00 local. */
export function startOfWeek(date: Date): Date {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** 42 days (6 weeks) covering the month grid, starting on the Sunday before. */
export function monthMatrix(viewDate: Date): Date[] {
  const start = startOfWeek(startOfMonth(viewDate));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** The 7 days of the week containing viewDate. */
export function weekDays(viewDate: Date): Date[] {
  const start = startOfWeek(viewDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function sameYmd(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
