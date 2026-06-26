/**
 * Pure geometry for the DonutChart, kept out of the component file so it can be
 * unit-tested and so the chart module only exports components (Fast Refresh).
 */

import type { Accent } from "../common/accent";

/** Default accent cycle for donut/pie segments (distinct, theme-aware colours). */
export const DONUT_ACCENTS: Accent[] = [
  "indigo",
  "emerald",
  "amber",
  "rose",
  "sky",
  "violet",
];

export interface DonutSegment {
  label: string;
  value: number;
  /** Explicit accent; when omitted a stable palette colour is assigned by order. */
  accent?: Accent;
}

export interface DonutArc extends DonutSegment {
  accent: Accent;
  /** Share of the whole, 0–100. */
  percent: number;
  /** Arc length along the circumference. */
  dash: number;
  /** strokeDashoffset that positions this arc after the preceding ones. */
  offset: number;
}

/**
 * Turn raw segments into renderable arcs whose dash lengths/offsets lay out
 * head-to-tail along `circumference`. Non-positive values are dropped; returns
 * [] when nothing is positive.
 */
export function donutArcs(
  segments: DonutSegment[],
  circumference: number,
): DonutArc[] {
  const positives = segments.filter((s) => s.value > 0);
  const total = positives.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];
  let cumulative = 0;
  return positives.map((s, i) => {
    const fraction = s.value / total;
    const dash = fraction * circumference;
    const arc: DonutArc = {
      ...s,
      accent: s.accent ?? DONUT_ACCENTS[i % DONUT_ACCENTS.length]!,
      percent: Math.round(fraction * 1000) / 10,
      dash,
      offset: -cumulative,
    };
    cumulative += dash;
    return arc;
  });
}
