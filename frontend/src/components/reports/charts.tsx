/** Shared CSS-bar chart primitives for the Reports tabs (no chart library). */

import { ACCENT_TEXT } from "../common/accent";
import { cn } from "@/lib/utils";
import { paletteAt, riseStyle } from "./report-palette";
import { donutArcs } from "./donut-geometry";
import type { DonutSegment } from "./donut-geometry";

export type { DonutSegment, DonutArc } from "./donut-geometry";

export interface BarItem {
  label: string;
  valueText: string;
  /** 0–1 of the row width. */
  ratio: number;
  /** Gradient classes (e.g. "from-indigo-500 to-violet-500") for the fill. */
  tone?: string;
}

/** Compact inline placeholder for an empty chart primitive. */
function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

/** Horizontal labelled bars (category / status / provider breakdowns). */
export function BarList({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <ChartEmpty label="No data in this range yet." />;
  }
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((it, i) => (
        <li key={it.label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-foreground">
              {it.label}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-muted-foreground">
              {it.valueText}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/70">
            <div
              style={{
                width: `${Math.min(100, Math.max(0, it.ratio * 100))}%`,
                ...riseStyle(i),
              }}
              className={`r-bar h-full rounded-full bg-gradient-to-r ${
                it.tone ?? paletteAt(i)
              }`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface ColumnItem {
  key: string;
  /** 0–1 of the chart height. */
  ratio: number;
  label: string;
  title: string;
  tone?: string;
}

/** Vertical column chart for monthly trends. */
export function ColumnChart({ items }: { items: ColumnItem[] }) {
  if (items.length === 0 || items.every((it) => it.ratio <= 0)) {
    return <ChartEmpty label="No trend data in this range yet." />;
  }
  // With many buckets (e.g. 24 months) the columns would crush to a few pixels
  // and the labels would overlap on narrow screens, so the track scrolls
  // horizontally with a per-column minimum once there are more than a handful.
  const many = items.length > 8;
  return (
    <div className={many ? "-mx-1 overflow-x-auto px-1" : ""}>
      <div className={`flex flex-col gap-2 ${many ? "min-w-[480px]" : ""}`}>
        <div className="flex h-44 items-end gap-1.5">
          {items.map((it, i) => (
            <div
              key={it.key}
              className="group flex h-full flex-1 items-end justify-center"
              title={it.title}
            >
              <div
                style={{
                  height: `${it.ratio > 0 ? Math.max(it.ratio * 100, 3) : 0}%`,
                  ...riseStyle(i),
                }}
                className={`r-col w-full rounded-t-md bg-gradient-to-t ${
                  it.tone ?? "from-indigo-500 to-violet-400"
                } opacity-85 transition-opacity group-hover:opacity-100`}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          {items.map((it) => (
            <div
              key={it.key}
              className="flex-1 truncate text-center text-[10px] font-medium text-muted-foreground"
            >
              {it.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Big centre text (e.g. a total). */
  centerValue?: string;
  /** Small centre caption under the value. */
  centerLabel?: string;
  /** Format a segment value for the legend (defaults to the raw number). */
  formatValue?: (value: number) => string;
  /** Empty-state copy when there's nothing positive to chart. */
  emptyLabel?: string;
}

/**
 * A donut chart for compositional (parts-of-a-whole) data — approval/scope/
 * reimbursement status splits, provider mix, etc. SVG arcs use `currentColor`
 * via per-accent text classes so light/dark "just work"; a legend lists each
 * slice with its value and share.
 */
export function DonutChart({
  segments,
  size = 150,
  thickness = 16,
  centerValue,
  centerLabel,
  formatValue = (v) => String(v),
  emptyLabel = "No data in this range yet.",
}: DonutChartProps) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arcs = donutArcs(segments, c);
  if (arcs.length === 0) return <ChartEmpty label={emptyLabel} />;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            className="stroke-muted"
          />
          {arcs.map((a, i) => (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${c - a.dash}`}
              strokeDashoffset={a.offset}
              className={cn(ACCENT_TEXT[a.accent], "r-rise")}
              style={riseStyle(i)}
            >
              <title>{`${a.label}: ${formatValue(a.value)} (${a.percent}%)`}</title>
            </circle>
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {centerValue && (
              <span className="text-xl font-bold tabular-nums text-foreground">
                {centerValue}
              </span>
            )}
            {centerLabel && (
              <span className="px-2 text-[11px] font-medium leading-tight text-muted-foreground">
                {centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-2">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center gap-2 text-sm">
            <span
              className={cn("size-2.5 shrink-0 rounded-full bg-current", ACCENT_TEXT[a.accent])}
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{a.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-muted-foreground">
              {formatValue(a.value)}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-xs text-muted-foreground/70">
              {a.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
