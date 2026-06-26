/**
 * Pure grouping for the print-only expense detail listing, kept out of the
 * component file so the chart/report module only exports components (Fast
 * Refresh). Groups expenses by their original currency — never combined.
 */

import { normalizeCurrency } from "../../lib/currency";
import type { Expense } from "../../types/expense";

export interface CurrencyExpenseGroup {
  currency: string;
  rows: Expense[];
  /** Sum of this group's amounts (single currency — never mixed). */
  subtotal: number;
  count: number;
}

/**
 * Group expenses by original currency, newest-first within each group, ordered
 * by subtotal descending (dominant currency first).
 */
export function groupExpensesByCurrency(expenses: Expense[]): CurrencyExpenseGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const currency = normalizeCurrency(e.currency);
    const rows = map.get(currency);
    if (rows) rows.push(e);
    else map.set(currency, [e]);
  }
  return [...map.entries()]
    .map(([currency, rows]) => ({
      currency,
      count: rows.length,
      subtotal:
        Math.round(rows.reduce((s, e) => s + (e.amount || 0), 0) * 100) / 100,
      rows: [...rows].sort((a, b) =>
        (b.expenseDate || "").localeCompare(a.expenseDate || ""),
      ),
    }))
    .sort((a, b) => b.subtotal - a.subtotal || a.currency.localeCompare(b.currency));
}
