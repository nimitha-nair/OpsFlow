/** Shared CSS-bar chart primitives for the Reports tabs (no chart library). */

import { useState, type ReactNode } from "react";

import { ACCENT_TEXT, currencyAccents, currencyGradient } from "../common/accent";
import type { Accent } from "../common/accent";
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

/**
 * Legend mapping each selected currency to its identity colour, shown once
 * above the combined multi-currency charts. Renders nothing for a single
 * currency (no ambiguity to resolve).
 */
export function CurrencyLegend({ currencies }: { currencies: string[] }) {
  if (currencies.length <= 1) return null;
  const accents = currencyAccents(currencies);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-foreground">
      <span className="text-muted-foreground">Currencies:</span>
      {currencies.map((cur) => (
        <span key={cur} className="flex items-center gap-1.5">
          <span
            className={cn("size-2.5 rounded-full bg-current", ACCENT_TEXT[accents[cur]!])}
            aria-hidden
          />
          {cur}
        </span>
      ))}
    </div>
  );
}

/**
 * Lay out a money chart per currency: with one currency it renders the chart
 * bare; with several it renders a small-multiples grid, each tagged with the
 * currency's identity colour. Money is never combined across currencies — each
 * cell is its own currency at its own scale.
 */
export function CurrencyMultiples({
  currencies,
  render,
  columns = 2,
}: {
  currencies: string[];
  render: (currency: string, accent: Accent) => ReactNode;
  /** 2 = side-by-side small multiples (charts); 1 = stacked (dense full sections). */
  columns?: 1 | 2;
}) {
  const accents = currencyAccents(currencies);
  if (currencies.length <= 1) {
    const cur = currencies[0] ?? "INR";
    return <>{render(cur, accents[cur] ?? "indigo")}</>;
  }
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-5",
        columns === 2 && "sm:grid-cols-2",
      )}
    >
      {currencies.map((cur) => (
        <div key={cur} className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 self-start text-xs font-bold tracking-wide text-foreground">
            <span
              className={cn("size-2.5 rounded-full bg-current", ACCENT_TEXT[accents[cur]!])}
              aria-hidden
            />
            {cur}
          </span>
          {render(cur, accents[cur]!)}
        </div>
      ))}
    </div>
  );
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

/* ----------------- Multi-series (multi-currency) primitives ----------------- */

export interface GroupedBar {
  /** Series identity, e.g. a currency code — drives the colour + label. */
  seriesKey: string;
  accent: Accent;
  /** 0–1 of the row width, normalised within this series' own scale. */
  ratio: number;
  /** Formatted value shown at the end of the bar (in the series' own units). */
  valueText: string;
}

export interface GroupedBarRow {
  label: string;
  bars: GroupedBar[];
}

/**
 * Horizontal bars grouped by category, with one colour-coded sub-bar per series
 * (currency). Each series is normalised to ITS OWN maximum — bar *shapes* show a
 * currency's distribution; the real amount is in the value label. Currencies are
 * never compared on a shared scale (and never summed).
 */
export function GroupedBarList({ rows }: { rows: GroupedBarRow[] }) {
  if (rows.length === 0) {
    return <ChartEmpty label="No data in this range yet." />;
  }
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row, ri) => (
        <li key={row.label} className="flex flex-col gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">
            {row.label}
          </span>
          <div className="flex flex-col gap-1">
            {row.bars.map((b, bi) => (
              <div key={b.seriesKey} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tabular-nums text-muted-foreground">
                  {b.seriesKey}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/70">
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, b.ratio * 100))}%`,
                      ...riseStyle(ri * 4 + bi),
                    }}
                    className={cn(
                      "r-bar h-full rounded-full bg-gradient-to-r",
                      currencyGradient(b.accent),
                    )}
                  />
                </div>
                <span className="shrink-0 tabular-nums text-xs font-medium text-muted-foreground">
                  {b.valueText}
                </span>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface GroupedColumn {
  seriesKey: string;
  accent: Accent;
  /** 0–1 of the chart height, normalised within this series' own scale. */
  ratio: number;
  /** Hover tooltip (currency + period + real amount). */
  title: string;
}

export interface GroupedColumnItem {
  key: string;
  label: string;
  columns: GroupedColumn[];
}

/**
 * Clustered vertical columns for monthly trends across currencies: each period
 * shows one colour-coded column per series, each normalised to its own scale.
 */
export function GroupedColumnChart({ items }: { items: GroupedColumnItem[] }) {
  const hasData = items.some((it) => it.columns.some((co) => co.ratio > 0));
  if (items.length === 0 || !hasData) {
    return <ChartEmpty label="No trend data in this range yet." />;
  }
  const cluster = "min-w-[44px] max-w-[88px] flex-1";
  return (
    <div className="-mx-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
      <div className="flex min-w-full flex-col gap-2">
        <div className="flex h-44 items-end justify-center gap-1.5">
          {items.map((it, i) => (
            <div
              key={it.key}
              className={`flex h-full items-end justify-center gap-0.5 ${cluster}`}
            >
              {it.columns.map((co) => (
                <div
                  key={co.seriesKey}
                  className="flex h-full flex-1 items-end justify-center"
                  title={co.title}
                >
                  <div
                    style={{
                      height: `${co.ratio > 0 ? Math.max(co.ratio * 100, 3) : 0}%`,
                      ...riseStyle(i),
                    }}
                    className={cn(
                      "r-col w-full rounded-t-md bg-gradient-to-t opacity-90 transition-opacity hover:opacity-100",
                      currencyGradient(co.accent),
                    )}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-1.5">
          {items.map((it) => (
            <div
              key={it.key}
              className={`truncate text-center text-[10px] font-medium text-muted-foreground ${cluster}`}
            >
              {it.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface ColumnItem {
  key: string;
  /** 0–1 of the chart height. */
  ratio: number;
  label: string;
  title: string;
  tone?: string;
  /** Formatted value for the single-period KPI fallback (e.g. "₹50,000"). */
  valueText?: string;
}

/**
 * Single-value KPI shown when a trend has only one period in range — a trend
 * needs at least two points to be a trend, so we show the value instead of a
 * lone stretched bar.
 */
export function SinglePeriodValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
      <span className="text-3xl font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground/70">
        Only one period in the selected range
      </span>
    </div>
  );
}

/** Vertical column chart for monthly trends; adapts to how many periods exist. */
export function ColumnChart({ items }: { items: ColumnItem[] }) {
  if (items.length === 0 || items.every((it) => it.ratio <= 0)) {
    return <ChartEmpty label="No trend data in this range yet." />;
  }
  // One period in range → a KPI, never a single stretched full-width bar.
  if (items.length === 1) {
    const it = items[0]!;
    return <SinglePeriodValue value={it.valueText ?? it.label} label={it.label} />;
  }
  // Every column keeps a minimum width so it never crushes on a narrow phone;
  // when the columns no longer fit, the track scrolls horizontally instead of
  // shrinking into slivers. On wide screens they grow (capped) and center.
  const col = "min-w-[44px] max-w-[88px] flex-1";
  return (
    <div className="-mx-1 overflow-x-auto px-1 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
      <div className="flex min-w-full flex-col gap-2">
        <div className="flex h-44 items-end justify-center gap-1.5">
          {items.map((it, i) => (
            <div
              key={it.key}
              className={`group flex h-full items-end justify-center ${col}`}
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
        <div className="flex justify-center gap-1.5">
          {items.map((it) => (
            <div
              key={it.key}
              className={`truncate text-center text-[10px] font-medium text-muted-foreground ${col}`}
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
  // Hover state: the slice (or legend row) under the cursor is emphasised while
  // the others dim, and the centre reflects that slice instead of the total.
  const [active, setActive] = useState<number | null>(null);
  if (arcs.length === 0) return <ChartEmpty label={emptyLabel} />;

  const activeArc = active != null ? arcs[active] : null;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={thickness}
            className="stroke-muted"
          />
          {arcs.map((a, i) => {
            const isActive = active === i;
            const dim = active != null && !isActive;
            return (
              <circle
                key={a.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="currentColor"
                strokeWidth={isActive ? thickness + 4 : thickness}
                strokeDasharray={`${a.dash} ${c - a.dash}`}
                strokeDashoffset={a.offset}
                className={cn(
                  ACCENT_TEXT[a.accent],
                  "r-rise cursor-pointer transition-all duration-150",
                  dim && "opacity-30",
                )}
                style={riseStyle(i)}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                <title>{`${a.label}: ${formatValue(a.value)} (${a.percent}%)`}</title>
              </circle>
            );
          })}
        </svg>
        {(activeArc || centerValue || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {(activeArc ? formatValue(activeArc.value) : centerValue) && (
              <span className="text-xl font-bold tabular-nums text-foreground">
                {activeArc ? formatValue(activeArc.value) : centerValue}
              </span>
            )}
            <span className="px-2 text-[11px] font-medium leading-tight text-muted-foreground">
              {activeArc ? `${activeArc.label} · ${activeArc.percent}%` : centerLabel}
            </span>
          </div>
        )}
      </div>

      <ul className="flex w-full min-w-0 flex-col gap-2">
        {arcs.map((a, i) => {
          const isActive = active === i;
          const dim = active != null && !isActive;
          return (
            <li
              key={a.label}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-sm transition-colors",
                isActive && "bg-muted/70",
                dim && "opacity-40",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
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
          );
        })}
      </ul>
    </div>
  );
}
