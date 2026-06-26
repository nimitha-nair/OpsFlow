/**
 * Renders a monetary aggregate that may span several currencies. Analytics never
 * sum across currencies, so this is the single presentation seam:
 *   - one currency  → a single formatted total (the original experience)
 *   - many          → a grouped breakdown (₹50,000 · $600 · €200) plus a clear
 *                     "multiple currencies" indicator, so no total is misleading.
 *
 * A future "Reporting Currency" feature collapses the per-currency array to one
 * entry (via exchange rates) before it reaches this component — no other change
 * needed here or upstream.
 */

import { Coins } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactMoney, formatMoney } from "../../lib/format";
import type { CurrencyTotal } from "../../lib/currency";

interface MoneyTotalsProps {
  /** Per-currency amounts. Empty → renders a zero in INR. */
  totals: CurrencyTotal[];
  /** Use compact money (₹50K) — good for dense KPI tiles. */
  compact?: boolean;
  /** Multi-currency layout. "stack" (default) for cards, "inline" for rows. */
  layout?: "stack" | "inline";
  /** Show the "multiple currencies" caption under a stacked breakdown. */
  showLabel?: boolean;
  className?: string;
}

export function MoneyTotals({
  totals,
  compact = false,
  layout = "stack",
  showLabel = true,
  className,
}: MoneyTotalsProps) {
  const fmt = compact ? formatCompactMoney : formatMoney;

  // Single (or no) currency: a plain value that inherits the caller's styling,
  // so existing single-currency surfaces look exactly as before.
  if (totals.length <= 1) {
    const t = totals[0];
    return (
      <span className={cn("tabular-nums", className)}>
        {t ? fmt(t.amount, t.currency) : fmt(0, "INR")}
      </span>
    );
  }

  if (layout === "inline") {
    return (
      <span className={cn("tabular-nums", className)}>
        {totals.map((t) => fmt(t.amount, t.currency)).join(" · ")}
      </span>
    );
  }

  // Multiple currencies: a compact stacked breakdown at its own readable size
  // (overrides an oversized parent font so 2–3 lines fit a card), with a badge.
  return (
    <span className={cn("flex flex-col gap-0.5", className)}>
      {totals.map((t) => (
        <span
          key={t.currency}
          className="text-lg font-bold leading-tight tabular-nums text-foreground"
        >
          {fmt(t.amount, t.currency)}
        </span>
      ))}
      {showLabel && (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Coins className="size-3" /> multiple currencies
        </span>
      )}
    </span>
  );
}
