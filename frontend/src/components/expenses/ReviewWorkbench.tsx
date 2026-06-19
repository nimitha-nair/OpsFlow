import { FileText } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MultiReceiptViewer } from "./MultiReceiptViewer";
import type { Expense } from "../../types/expense";

/**
 * Two-column review shell for HR/Admin:
 *   Left  — the original receipt in the SAME ReceiptViewer the employee analysis
 *           flow uses (zoom / fit-width / fit-page / fullscreen; images + PDFs).
 *   Right — AI audit trail and approval controls (passed as children).
 *
 * Stacks to a single column below `lg`. On desktop the receipt column sticks so
 * it stays in view while the reviewer scrolls the audit trail and acts on it
 * without leaving the page.
 */
export function ReviewWorkbench({
  expense,
  children,
}: {
  expense: Expense;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-muted-foreground" />
            Receipt
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expense.documentId ? (
            <MultiReceiptViewer expenseId={expense.id} />
          ) : (
            <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
              No receipt was attached to this expense.
            </p>
          )}
        </CardContent>
      </Card>

      {/* min-w-0 lets the audit comparison table scroll within the column
          instead of forcing the whole grid to overflow. */}
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </div>
  );
}
