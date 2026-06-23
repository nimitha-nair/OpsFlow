import type { CSSProperties } from "react";

/** Cohesive vivid accent palette shared by dashboards and reports. */
export type Accent =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "slate";

/** Gradient fills for chart bars/columns, cycled by index. */
export const BAR_PALETTE = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-sky-500 to-blue-500",
  "from-fuchsia-500 to-purple-500",
];

export function paletteAt(index: number): string {
  return BAR_PALETTE[index % BAR_PALETTE.length]!;
}

/** Accent → SVG/text colour class (drives `currentColor` in the bi charts). */
export const ACCENT_TEXT: Record<Accent, string> = {
  indigo: "text-indigo-500",
  violet: "text-violet-500",
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  rose: "text-rose-500",
  sky: "text-sky-500",
  slate: "text-slate-500",
};

/** Index var for the staggered entrance animations (`--r-i`). */
export function riseStyle(index: number): CSSProperties {
  return { ["--r-i" as string]: index } as CSSProperties;
}

/** Per-accent presentation tokens for the metric card. */
export const ACCENTS: Record<
  Accent,
  { chip: string; value: string; glow: string }
> = {
  indigo: {
    chip: "from-indigo-500 to-violet-500",
    value: "text-indigo-600 dark:text-indigo-300",
    glow: "rgba(99,102,241,0.20)",
  },
  violet: {
    chip: "from-violet-500 to-fuchsia-500",
    value: "text-violet-600 dark:text-violet-300",
    glow: "rgba(139,92,246,0.20)",
  },
  emerald: {
    chip: "from-emerald-500 to-teal-500",
    value: "text-emerald-600 dark:text-emerald-300",
    glow: "rgba(16,185,129,0.20)",
  },
  amber: {
    chip: "from-amber-500 to-orange-500",
    value: "text-amber-600 dark:text-amber-300",
    glow: "rgba(245,158,11,0.22)",
  },
  rose: {
    chip: "from-rose-500 to-pink-500",
    value: "text-rose-600 dark:text-rose-300",
    glow: "rgba(244,63,94,0.20)",
  },
  sky: {
    chip: "from-sky-500 to-blue-500",
    value: "text-sky-600 dark:text-sky-300",
    glow: "rgba(14,165,233,0.20)",
  },
  slate: {
    chip: "from-slate-500 to-slate-600",
    value: "text-slate-600 dark:text-slate-300",
    glow: "rgba(100,116,139,0.18)",
  },
};
