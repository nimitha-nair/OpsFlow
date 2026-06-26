/**
 * Client-side group-by-currency helpers, mirroring the backend
 * reports.aggregate currency logic. Analytics never sum across currencies — a
 * surface scopes to one active currency and lists every currency present so the
 * user can switch or see the breakdown.
 */

export interface CurrencyTotal {
  currency: string;
  count: number;
  amount: number;
}

/** Normalize a raw currency value to a non-empty uppercase code (default INR). */
export function normalizeCurrency(value?: string | null): string {
  if (typeof value !== "string") return "INR";
  const code = value.trim().toUpperCase();
  return code.length > 0 ? code : "INR";
}

/** Tally count + amount per currency, descending by amount (ties: code asc). */
export function totalsByCurrency(
  rows: Array<{ currency?: string | null; amount?: number }>,
): CurrencyTotal[] {
  const map = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const currency = normalizeCurrency(r.currency);
    const b = map.get(currency) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += typeof r.amount === "number" ? r.amount : 0;
    map.set(currency, b);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({
      currency,
      count: v.count,
      amount: Math.round(v.amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

/**
 * Choose which currency to scope to: the requested one when it has data,
 * otherwise the dominant (largest amount), falling back to INR.
 */
export function pickActiveCurrency(
  totals: CurrencyTotal[],
  requested?: string,
): string {
  if (requested) {
    const norm = normalizeCurrency(requested);
    if (totals.some((t) => t.currency === norm)) return norm;
  }
  return totals[0]?.currency ?? "INR";
}
