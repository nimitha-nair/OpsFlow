/** Shared CSS-bar chart primitives for the Reports tabs (no chart library). */

export interface BarItem {
  label: string;
  valueText: string;
  /** 0–1 of the row width. */
  ratio: number;
  /** Tailwind bg class for the fill (defaults to primary). */
  tone?: string;
}

/** Horizontal labelled bars (category / status / provider breakdowns). */
export function BarList({ items }: { items: BarItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No data.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((it) => (
        <li key={it.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{it.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {it.valueText}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${it.tone ?? "bg-primary/70"}`}
              style={{ width: `${Math.min(100, Math.max(0, it.ratio * 100))}%` }}
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
      <div className="flex h-40 items-end gap-1.5">
        {items.map((it) => (
          <div
            key={it.key}
            className="flex flex-1 items-end justify-center"
            title={it.title}
          >
            <div
              className={`w-full rounded-t ${it.tone ?? "bg-primary/70"} transition-all`}
              style={{ height: `${it.ratio > 0 ? Math.max(it.ratio * 100, 3) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {items.map((it) => (
          <div
            key={it.key}
            className="flex-1 truncate text-center text-[10px] text-muted-foreground"
          >
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}
