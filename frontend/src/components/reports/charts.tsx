/** Shared CSS-bar chart primitives for the Reports tabs (no chart library). */

import { paletteAt, riseStyle } from "./report-palette";

export interface BarItem {
  label: string;
  valueText: string;
  /** 0–1 of the row width. */
  ratio: number;
  /** Gradient classes (e.g. "from-indigo-500 to-violet-500") for the fill. */
  tone?: string;
}

/** Horizontal labelled bars (category / status / provider breakdowns). */
export function BarList({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
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
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-44 items-end gap-1.5">
        {items.map((it, i) => (
          <div
            key={it.key}
            className="group flex flex-1 items-end justify-center"
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
  );
}
