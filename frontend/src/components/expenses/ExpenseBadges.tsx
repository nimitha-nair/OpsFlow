import { Bot, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  APPROVAL_LABELS,
  REIMBURSEMENT_LABELS,
  TYPE_LABELS,
  type ApprovalStatus,
  type ExpenseType,
  type ReimbursementStatus,
} from "../../types/expense";

const APPROVAL_STYLES: Record<ApprovalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  PENDING_REVIEW:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  APPROVED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const REIMBURSEMENT_STYLES: Record<ReimbursementStatus, string> = {
  PENDING:
    "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  PROCESSING:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge className={cn("border-transparent", APPROVAL_STYLES[status])}>
      {APPROVAL_LABELS[status]}
    </Badge>
  );
}

export function ReimbursementBadge({
  status,
}: {
  status: ReimbursementStatus;
}) {
  return (
    <Badge className={cn("border-transparent", REIMBURSEMENT_STYLES[status])}>
      {REIMBURSEMENT_LABELS[status]}
    </Badge>
  );
}

export function ExpenseTypeBadge({ type }: { type: ExpenseType }) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {TYPE_LABELS[type]}
    </Badge>
  );
}

/**
 * How the expense was created — "AI Extracted" (receipt) or "Manual Entry"
 * (no receipt). Manual expenses may warrant extra reviewer scrutiny. Renders
 * nothing for legacy expenses that predate creation-method tracking.
 */
export function CreationMethodBadge({
  method,
}: {
  method?: "AI" | "MANUAL";
}) {
  if (!method) return null;
  if (method === "MANUAL") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-300 font-normal text-amber-700 dark:text-amber-400"
      >
        <PencilLine className="size-3" />
        Manual Entry
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-indigo-300 font-normal text-indigo-700 dark:text-indigo-400"
    >
      <Bot className="size-3" />
      AI Extracted
    </Badge>
  );
}
