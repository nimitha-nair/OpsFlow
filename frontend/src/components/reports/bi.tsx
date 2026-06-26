/**
 * Bespoke, dependency-free BI chart primitives for the executive reporting
 * surfaces. These complement the simpler CSS bars in `charts.tsx` with
 * SVG-based visuals (sparklines, area trends, donut gauges, ranked bars, and
 * heatmaps) plus richer KPI tiles with trend deltas.
 *
 * All visuals are theme-aware: SVG strokes/fills use `currentColor`, and the
 * accent text colour is supplied by a wrapper class so light/dark and every
 * accent "just work". Entrance/interaction animations reuse the `.r-*` classes
 * from `styles/motion.css`.
 */

import { useId, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACCENT_TEXT, ACCENTS, riseStyle, type Accent } from "../common/accent";
import { SinglePeriodValue } from "./charts";

/* ------------------------------------------------------------------ */
/* Trend delta badge                                                   */
/* ------------------------------------------------------------------ */

interface TrendBadgeProps {
  /** Signed percentage change, e.g. 12.4 or -3.1. */
  value: number | null;
  /** When true, a decrease is "good" (green) and an increase is "bad" (red). */
  invert?: boolean;
  /** Optional trailing context, e.g. "vs prev. period". */
  suffix?: string;
  className?: string;
}

/** A compact up/down pill conveying direction and magnitude of change. */
export function TrendBadge({ value, invert, suffix, className }: TrendBadgeProps) {
  if (value === null || Number.isNaN(value)) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        <Minus className="size-3" /> —{suffix ? ` ${suffix}` : ""}
      </span>
    );
  }
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = flat ? null : invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        good === null && "bg-muted text-muted-foreground",
        good === true &&
          "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
        good === false && "bg-rose-500/12 text-rose-600 dark:text-rose-400",
        className,
      )}
    >
      <Icon className="size-3" />
      {up ? "+" : ""}
      {value.toFixed(1)}%{suffix ? <span className="font-normal opacity-70">{` ${suffix}`}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

interface SparklineProps {
  points: number[];
  className?: string;
  /** Render height in px (width is fluid). */
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
}

/** A tiny inline trend line for KPI tiles. */
export function Sparkline({
  points,
  className,
  height = 36,
  strokeWidth = 2,
  fill = true,
}: SparklineProps) {
  const gradId = useId();
  if (points.length < 2) {
    return <div style={{ height }} className={className} />;
  }
  const w = 100;
  const h = height;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - 3 - ((p - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={h}
      className={cn("overflow-visible", className)}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradId})`} stroke="none" />}
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Area trend (monthly series with axis + grid)                        */
/* ------------------------------------------------------------------ */

export interface TrendPoint {
  label: string;
  value: number;
}

interface AreaTrendProps {
  data: TrendPoint[];
  accent?: Accent;
  height?: number;
  /** Format a value for the hover tooltip / peak annotation. */
  format?: (v: number) => string;
}

/** A premium area+line trend chart with gridlines and an x-axis. */
export function AreaTrend({
  data,
  accent = "indigo",
  height = 220,
  format = (v) => String(v),
}: AreaTrendProps) {
  const gradId = useId();
  if (data.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
        No trend data in this range yet.
      </div>
    );
  }
  // One period in range → a KPI, not a single stretched point/area.
  if (data.length === 1) {
    const p = data[0]!;
    return <SinglePeriodValue value={format(p.value)} label={p.label} />;
  }
  const w = 600;
  const h = height;
  const padTop = 12;
  const padBottom = 4;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const step = w / (data.length - 1);
  const y = (v: number) => padTop + (1 - v / max) * (h - padTop - padBottom);
  const coords = data.map((d, i) => [i * step, y(d.value)] as const);
  const line = coords
    .map(([cx, cy], i) => `${i ? "L" : "M"}${cx.toFixed(1)},${cy.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => padTop + f * (h - padTop - padBottom));
  const peakIndex = values.indexOf(Math.max(...values));

  return (
    <div className={cn("flex flex-col gap-2", ACCENT_TEXT[accent])}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          width="100%"
          height={h}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {grid.map((gy, i) => (
            <line
              key={i}
              x1="0"
              x2={w}
              y1={gy}
              y2={gy}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill={`url(#${gradId})`} className="r-rise" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Round peak marker, positioned with HTML so it never distorts. */}
        <span
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ring-2 ring-background"
          style={{
            left: `${(peakIndex / (data.length - 1)) * 100}%`,
            top: `${(y(values[peakIndex]!) / h) * 100}%`,
          }}
        />
      </div>
      <div className="flex gap-1">
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            className="flex-1 truncate text-center text-[10px] font-medium text-muted-foreground"
            title={`${d.label}: ${format(d.value)}`}
          >
            {data.length > 14 && i % 2 === 1 ? "" : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut gauge (single percentage / score)                            */
/* ------------------------------------------------------------------ */

interface DonutGaugeProps {
  /** 0–100. */
  value: number;
  size?: number;
  thickness?: number;
  accent?: Accent;
  /** Threshold bands [warnBelow, goodAtOrAbove] for auto colour (e.g. health). */
  centerLabel?: string;
  centerSub?: string;
  /** Override the centre big text (defaults to `value%`). */
  centerValue?: string;
}

/** A single-metric ring gauge with centred value. */
export function DonutGauge({
  value,
  size = 132,
  thickness = 12,
  accent = "indigo",
  centerLabel,
  centerSub,
  centerValue,
}: DonutGaugeProps) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", ACCENT_TEXT[accent])}
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
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.21,1.02,0.73,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {centerValue ?? `${Math.round(pct)}%`}
        </span>
        {centerLabel && (
          <span className="px-2 text-[11px] font-medium leading-tight text-muted-foreground">
            {centerLabel}
          </span>
        )}
        {centerSub && (
          <span className="text-[10px] text-muted-foreground/70">{centerSub}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked horizontal bars (top departments / employees)               */
/* ------------------------------------------------------------------ */

export interface RankItem {
  label: string;
  valueText: string;
  /** 0–1 of the widest bar. */
  ratio: number;
  sub?: string;
  to?: string;
}

/** A ranked list with position badges and proportional bars. */
export function RankingList({ items, accent = "indigo" }: { items: RankItem[]; accent?: Accent }) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
        No data in this range yet.
      </div>
    );
  }
  const a = ACCENTS[accent];
  return (
    <ol className="flex flex-col gap-3">
      {items.map((it, i) => {
        const body = (
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white shadow-sm",
                a.chip,
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {it.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {it.valueText}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted/70">
                <div
                  style={{ width: `${Math.min(100, Math.max(2, it.ratio * 100))}%`, ...riseStyle(i) }}
                  className={cn("r-bar h-full rounded-full bg-gradient-to-r", a.chip)}
                />
              </div>
              {it.sub && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{it.sub}</div>
              )}
            </div>
          </div>
        );
        return (
          <li key={`${it.label}-${i}`}>
            {it.to ? (
              <Link to={it.to} className="block rounded-lg transition-colors hover:bg-muted/40">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap (month × category intensity)                               */
/* ------------------------------------------------------------------ */

interface HeatmapProps {
  xLabels: string[];
  yLabels: string[];
  /** matrix[y][x] absolute value. */
  matrix: number[][];
  accent?: Accent;
  format?: (v: number) => string;
}

/** A density grid; cell opacity scales with value relative to the max. */
export function Heatmap({
  xLabels,
  yLabels,
  matrix,
  accent = "indigo",
  format = (v) => String(v),
}: HeatmapProps) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className={cn("w-full overflow-x-auto", ACCENT_TEXT[accent])}>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `minmax(96px,1fr) repeat(${xLabels.length}, minmax(40px,1fr))` }}
      >
        <div />
        {xLabels.map((x) => (
          <div key={x} className="truncate pb-1 text-center text-[10px] font-medium text-muted-foreground">
            {x}
          </div>
        ))}
        {yLabels.map((yLab, yi) => (
          <Row key={yLab} label={yLab} cells={matrix[yi] ?? []} max={max} format={format} />
        ))}
      </div>
    </div>
  );
}

function Row({
  label,
  cells,
  max,
  format,
}: {
  label: string;
  cells: number[];
  max: number;
  format: (v: number) => string;
}) {
  return (
    <>
      <div className="flex items-center truncate pr-2 text-xs font-medium text-foreground">
        {label}
      </div>
      {cells.map((v, xi) => {
        const intensity = v / max;
        return (
          <div
            key={xi}
            title={`${label} · ${format(v)}`}
            className="flex aspect-square items-center justify-center rounded-md text-[10px] font-semibold"
            style={{
              backgroundColor:
                v <= 0 ? "var(--color-muted)" : `color-mix(in oklab, currentColor ${Math.round(12 + intensity * 78)}%, transparent)`,
              color: intensity > 0.55 ? "white" : "var(--color-foreground)",
            }}
          >
            {v > 0 && intensity > 0.18 ? format(v) : ""}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* KPI card with trend + optional sparkline                            */
/* ------------------------------------------------------------------ */

interface KpiCardProps {
  label: string;
  /** A formatted value, or a node (e.g. a multi-currency breakdown). */
  value: ReactNode;
  icon: LucideIcon;
  accent: Accent;
  hint?: string;
  /** Signed percentage change shown as a TrendBadge. */
  trend?: number | null;
  /** When true a decrease is "good" for the trend colour. */
  invertTrend?: boolean;
  /** Optional sparkline series. */
  spark?: number[];
  index?: number;
  to?: string;
  emphasize?: boolean;
}

/**
 * The executive KPI tile: gradient icon chip, large accent value, an optional
 * trend delta, and an optional sparkline — sharing the visual language of the
 * existing MetricCard but richer for leadership dashboards.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
  trend,
  invertTrend,
  spark,
  index = 0,
  to,
  emphasize = false,
}: KpiCardProps) {
  const a = ACCENTS[accent];
  const inner = (
    <Card
      style={riseStyle(index)}
      className={cn(
        "r-card r-rise relative h-full overflow-hidden border-border/60 transition-shadow duration-200 hover:shadow-md",
        to && "cursor-pointer",
      )}
    >
      {/* Subtle accent: a soft corner glow + a hairline top edge in the accent. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-60"
        style={{ backgroundImage: `linear-gradient(to right, transparent, ${a.glow}, transparent)` }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-70 blur-2xl"
        style={{ background: `radial-gradient(circle, ${a.glow}, transparent 70%)` }}
      />
      <div className="relative flex h-full flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm sm:size-9",
              a.chip,
            )}
          >
            <Icon className="size-4 sm:size-[18px]" />
          </span>
          {trend !== undefined && <TrendBadge value={trend ?? null} invert={invertTrend} />}
        </div>
        <div className="min-w-0">
          <div
            className={cn(
              "whitespace-nowrap font-bold leading-tight tracking-tight tabular-nums",
              a.value,
              emphasize ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
            )}
          >
            {value}
          </div>
          <div className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {hint && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground/70">{hint}</div>
          )}
        </div>
        {spark && spark.length > 1 && (
          <div className={cn("mt-auto", ACCENT_TEXT[accent])}>
            <Sparkline points={spark} height={28} />
          </div>
        )}
      </div>
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
