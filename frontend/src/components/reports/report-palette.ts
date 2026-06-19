import type { CSSProperties } from "react";

/** Cohesive vivid accent palette for the Reports module. */
export type Accent =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "sky";

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

/** Index var for the staggered entrance animations (`--r-i`). */
export function riseStyle(index: number): CSSProperties {
  return { ["--r-i" as string]: index } as CSSProperties;
}
