export interface ProjectColor {
  /** Light badge background + text (with dark-mode variants). */
  badge: string;
  /** Solid dot/accent color. */
  dot: string;
  /** Solid bar fill (timeline). */
  bar: string;
}

const PALETTE: ProjectColor[] = [
  { badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", dot: "bg-blue-500", bar: "bg-blue-500" },
  { badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", dot: "bg-violet-500", bar: "bg-violet-500" },
  { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  { badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500", bar: "bg-amber-500" },
  { badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", dot: "bg-rose-500", bar: "bg-rose-500" },
  { badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", dot: "bg-cyan-500", bar: "bg-cyan-500" },
  { badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", dot: "bg-fuchsia-500", bar: "bg-fuchsia-500" },
  { badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", dot: "bg-teal-500", bar: "bg-teal-500" },
];

/** Deterministic color for a project id, stable across renders. */
export function projectColor(projectId: string): ProjectColor {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash * 31 + projectId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}
