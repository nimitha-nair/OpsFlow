/**
 * A print-only, per-expense detail listing for the expense-analytics surfaces.
 * Hidden on screen (charts/KPIs stay clean); rendered into the PDF so a printed
 * report includes EVERY expense alongside the aggregates.
 *
 * Expenses are grouped by their original currency (never combined into one
 * total) with a per-currency subtotal, and ordered newest-first within each
 * group. Admin/HR prints include the employee column; the employee print omits
 * it (it's their own expenses).
 */

import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "../../lib/format";
import {
  APPROVAL_LABELS,
  CATEGORY_LABELS,
  type Expense,
} from "../../types/expense";
import { groupExpensesByCurrency } from "./expense-detail-group";

interface ExpenseDetailTableProps {
  expenses: Expense[];
  /** Admin/HR show the employee column; employee omits it. */
  scope: "admin" | "employee";
  /** Resolve employeeId → display name (admin/HR). */
  employeeNames?: Map<string, string>;
  /** Section heading shown above the listing in the printout. */
  title?: string;
  className?: string;
}

export function ExpenseDetailTable({
  expenses,
  scope,
  employeeNames,
  title = "Expense detail — every expense by currency",
  className,
}: ExpenseDetailTableProps) {
  const groups = groupExpensesByCurrency(expenses);
  const showEmployee = scope === "admin";

  // Print-only: hidden on screen, block when printing (portal clone + @media print).
  return (
    <section
      className={cn(
        "hidden print:block",
        // Avoid splitting the whole section awkwardly; let groups break instead.
        "[break-inside:auto]",
        className,
      )}
      data-testid="expense-detail-print"
    >
      <h3 className="mb-2 mt-4 text-sm font-semibold text-foreground">{title}</h3>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">No expenses in this range.</p>
      ) : (
        groups.map((group) => (
          <div key={group.currency} className="mb-4 [break-inside:avoid]">
            <div className="mb-1 flex items-center justify-between text-xs font-semibold text-foreground">
              <span>{group.currency}</span>
              <span className="tabular-nums">
                {group.count} expense{group.count === 1 ? "" : "s"} · subtotal{" "}
                {formatMoney(group.subtotal, group.currency)}
              </span>
            </div>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Code</th>
                  <th className="py-1 pr-2 font-medium">Date</th>
                  {showEmployee && <th className="py-1 pr-2 font-medium">Employee</th>}
                  <th className="py-1 pr-2 font-medium">Category</th>
                  <th className="py-1 pr-2 font-medium">Description</th>
                  <th className="py-1 pr-2 text-right font-medium">Amount</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 align-top">
                    <td className="py-1 pr-2 tabular-nums">{e.code ?? e.id.slice(0, 6)}</td>
                    <td className="py-1 pr-2 whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                    {showEmployee && (
                      <td className="py-1 pr-2">
                        {employeeNames?.get(e.employeeId) ?? e.employeeId}
                      </td>
                    )}
                    <td className="py-1 pr-2">
                      {CATEGORY_LABELS[e.category] ?? e.category}
                    </td>
                    <td className="py-1 pr-2">{e.description || "—"}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatMoney(e.amount, e.currency)}
                    </td>
                    <td className="py-1">{APPROVAL_LABELS[e.approvalStatus] ?? e.approvalStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}
