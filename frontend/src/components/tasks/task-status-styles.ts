import type { TaskStatus } from "../../types/task";

/** Shared status chip/badge colours (kept out of component files for fast-refresh). */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  IN_PROGRESS:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  ON_HOLD:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  REVIEW:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};
