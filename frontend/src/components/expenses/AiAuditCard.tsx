import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AnalysisAuditPanel } from "./AnalysisAuditPanel";
import { MultiReceiptViewer } from "./MultiReceiptViewer";
import type { Expense } from "../../types/expense";

/**
 * Admin-only, default-collapsed AI audit/investigation card. Admins are the final
 * authority and occasionally need to investigate disputes, reimbursement issues,
 * or extraction quality — so the full audit trail (receipt + original AI extraction
 * vs employee corrections vs final values, with confidence/provider/model) is
 * available on demand without cluttering the default view.
 */
export function AiAuditCard({ expense }: { expense: Expense }) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="p-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left"
        >
          <span className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4 text-ai" />
            AI Audit
          </span>
          {open ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Investigation view — original receipt, AI extraction, employee
            corrections, and final submitted values.
          </p>
          {expense.documentId ? (
            <MultiReceiptViewer expenseId={expense.id} />
          ) : (
            <p className="rounded-md border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              No receipt was attached (manual entry).
            </p>
          )}
          <AnalysisAuditPanel expense={expense} showTechnical showRisk />
        </CardContent>
      )}
    </Card>
  );
}
