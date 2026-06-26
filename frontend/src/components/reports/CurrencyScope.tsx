/**
 * Group-by-currency control for report surfaces. When expenses span multiple
 * currencies it renders a pill per currency (code + compact total) so the user
 * can scope analytics to one; with a single currency it collapses to a subtle
 * informational chip. Analytics are never summed across currencies, so picking
 * a currency here is what keeps every KPI/chart/total mathematically honest.
 */

import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactMoney } from "../../lib/format";
import type { CurrencyTotal } from "../../lib/currency";

interface CurrencyScopeProps {
  totals: CurrencyTotal[];
  active: string;
  onChange: (currency: string) => void;
  className?: string;
}

export function CurrencyScope({
  totals,
  active,
  onChange,
  className,
}: CurrencyScopeProps) {
  if (!totals || totals.length === 0) return null;

  // Single currency: no choice to make — show a quiet chip for transparency.
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

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Coins className="size-3.5" />
        <span>Currency · totals never mix across currencies</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {totals.map((t) => {
          const selected = t.currency === active;
          return (
            <button
              key={t.currency}
              type="button"
              onClick={() => onChange(t.currency)}
              aria-pressed={selected}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                selected
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
