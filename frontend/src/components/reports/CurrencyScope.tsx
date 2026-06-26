/**
 * Multi-select currency filter for report surfaces. Expenses span one or more
 * currencies; selecting several renders one report section per currency (never
 * combined). With a single currency present it collapses to a quiet info chip.
 * Selecting one currency keeps today's single-currency layout.
 */

import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactMoney } from "../../lib/format";
import type { CurrencyTotal } from "../../lib/currency";

interface CurrencyScopeProps {
  totals: CurrencyTotal[];
  /** Currently selected currency codes. */
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function CurrencyScope({
  totals,
  selected,
  onChange,
  className,
}: CurrencyScopeProps) {
  if (!totals || totals.length === 0) return null;

  // Single currency present: no choice to make — show a quiet chip.
  if (totals.length === 1) {
    const only = totals[0]!;
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground",
          className,
        )}
      >
        <Coins className="size-3.5" />
        {only.currency}
        <span className="tabular-nums">
          {formatCompactMoney(only.amount, only.currency)}
        </span>
      </div>
    );
  }

  const selectedSet = new Set(selected);
  const all = totals.map((t) => t.currency);

  const toggle = (currency: string) => {
    const next = new Set(selectedSet);
    if (next.has(currency)) next.delete(currency);
    else next.add(currency);
    // Never allow an empty selection (a blank report) — keep at least the one.
    if (next.size === 0) return;
    // Preserve the totals order.
    onChange(all.filter((c) => next.has(c)));
  };

  const allSelected = selected.length === all.length;

  return (
    <div className={cn("no-print flex flex-col gap-1.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Coins className="size-3.5" />
          <span>Currencies · each shown in its own section, never combined</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(all)}
            disabled={allSelected}
            className="font-medium text-primary hover:underline disabled:opacity-40 disabled:no-underline"
          >
            Select all
          </button>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            // Clear All resets to the dominant currency rather than blanking.
            onClick={() => onChange([all[0]!])}
            className="font-medium text-muted-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {totals.map((t) => {
          const isSelected = selectedSet.has(t.currency);
          return (
            <button
              key={t.currency}
              type="button"
              onClick={() => toggle(t.currency)}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-muted/60",
              )}
            >
              {t.currency}
              <span className="tabular-nums opacity-80">
                {formatCompactMoney(t.amount, t.currency)}
              </span>
              <span className="tabular-nums opacity-60">· {t.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
