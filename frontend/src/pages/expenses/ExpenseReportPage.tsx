import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import {
  ApprovalStatusBadge,
  CreationMethodBadge,
  ReimbursementBadge,
} from "../../components/expenses/ExpenseBadges";
import { AnalysisAuditPanel } from "../../components/expenses/AnalysisAuditPanel";
import { ReceiptThumbnails } from "../../components/expenses/ReceiptThumbnails";
import {
  apiErrorMessage,
  getExpense,
  getExpenseReviewInfo,
} from "../../lib/expenses-api";
import { getProject } from "../../lib/projects-api";
import { formatDate, formatMoney } from "../../lib/format";
import {
  CATEGORY_LABELS,
  TYPE_LABELS,
  type Expense,
  type ReviewInfo,
} from "../../types/expense";

/**
 * Print-friendly expense report. Assembles the expense details, receipt previews,
 * AI extraction + corrections audit, and approval information into a clean layout
 * that the browser can "Save as PDF" via the print dialog. Available to the owner
 * (verified), HR (reviewed), and Admin (audited) — the content is the same.
 */
export function ExpenseReportPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [projectName, setProjectName] = useState("General");
  const [reviewInfo, setReviewInfo] = useState<ReviewInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await getExpense(id);
        if (cancelled) return;
        setExpense(e);
        if (e.scope === "PROJECT" && e.projectId) {
          getProject(e.projectId)
            .then((p) => !cancelled && setProjectName(p.name))
            .catch(() => undefined);
        }
        if (e.approvalStatus === "APPROVED" || e.approvalStatus === "REJECTED") {
          getExpenseReviewInfo(id)
            .then((r) => !cancelled && setReviewInfo(r))
            .catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Expense not found."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <LoadingState label="Preparing report…" />;
  if (error || !expense) {
    return (
      <ErrorState
        title="Report unavailable"
        description={error ?? "This expense could not be found."}
        onRetry={() => navigate(-1)}
        retryLabel="Go back"
      />
    );
  }

  const reviewed =
    expense.approvalStatus === "APPROVED" ||
    expense.approvalStatus === "REJECTED";

  return (
    <div className="mx-auto max-w-3xl">
      {/* Actions — excluded from print. */}
      <div className="no-print mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Export PDF
        </Button>
      </div>

      <div data-print-root className="flex flex-col gap-4 bg-background p-2">
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight">Expense Report</h1>
            <p className="text-sm text-muted-foreground">
              Generated {formatDate(new Date().toISOString())}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <ApprovalStatusBadge status={expense.approvalStatus} />
            <CreationMethodBadge method={expense.creationMethod} />
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expense details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field
                label="Amount"
                value={formatMoney(expense.amount, expense.currency)}
              />
              <Field label="Category" value={CATEGORY_LABELS[expense.category]} />
              <Field
                label="Scope"
                value={expense.scope === "GENERAL" ? "General" : projectName}
              />
              <Field label="Type" value={TYPE_LABELS[expense.type]} />
              <Field
                label="Expense date"
                value={formatDate(expense.expenseDate)}
              />
              <Field label="Submitted" value={formatDate(expense.createdAt)} />
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">
                  Reimbursement
                </dt>
                <dd>
                  <ReimbursementBadge status={expense.reimbursementStatus} />
                </dd>
              </div>
            </dl>
            {expense.description && (
              <div className="mt-4 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Description
                </span>
                <p className="whitespace-pre-wrap text-sm">
                  {expense.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {expense.documentId && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiptThumbnails expenseId={expense.id} />
            </CardContent>
          </Card>
        )}

        {/* AI extraction + corrections audit (self-hides for manual expenses). */}
        <AnalysisAuditPanel expense={expense} />

        {reviewed && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Approval information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Decision
                  </dt>
                  <dd>
                    <ApprovalStatusBadge status={expense.approvalStatus} />
                  </dd>
                </div>
                <Field
                  label="Reviewed by"
                  value={
                    reviewInfo?.reviewerName ?? expense.reviewedByName ?? "—"
                  }
                />
                <Field
                  label="Reviewed on"
                  value={
                    reviewInfo?.reviewedAt
                      ? formatDate(reviewInfo.reviewedAt)
                      : expense.reviewedAt
                        ? formatDate(expense.reviewedAt)
                        : "—"
                  }
                />
              </dl>
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Remarks
                </span>
                <p className="whitespace-pre-wrap text-sm">
                  {reviewInfo?.remarks?.trim() ||
                    expense.reviewRemarks?.trim() ||
                    "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}
