import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Download,
  FileText,
  Loader2,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import {
  ApprovalStatusBadge,
  CreationMethodBadge,
  ReimbursementBadge,
} from "../../components/expenses/ExpenseBadges";
import { AnalysisAuditPanel } from "../../components/expenses/AnalysisAuditPanel";
import { AiAuditCard } from "../../components/expenses/AiAuditCard";
import { MultiReceiptViewer } from "../../components/expenses/MultiReceiptViewer";
import { ReviewWorkbench } from "../../components/expenses/ReviewWorkbench";
import { useAuth } from "../../context/auth-context";
import { formatDate, formatMoney } from "../../lib/format";
import { roleBasePath } from "../../lib/navigation";
import {
  apiErrorMessage,
  approveExpense,
  deleteExpense,
  downloadExpenseDocument,
  getExpense,
  getExpenseDocument,
  getExpenseReviewInfo,
  rejectExpense,
  startExpenseReview,
  submitExpense,
  viewExpenseDocument,
} from "../../lib/expenses-api";
import { getProject } from "../../lib/projects-api";
import {
  CATEGORY_LABELS,
  TYPE_LABELS,
  type Expense,
  type ExpenseFileView,
  type ReviewInfo,
} from "../../types/expense";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ExpenseDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user ? roleBasePath[user.role] : "/";

  const [expense, setExpense] = useState<Expense | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [remarks, setRemarks] = useState("");
  const [reviewInfo, setReviewInfo] = useState<ReviewInfo | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [docMeta, setDocMeta] = useState<ExpenseFileView | null>(null);
  const [docViewing, setDocViewing] = useState(false);
  const [docDownloading, setDocDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const expenseId = id;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getExpense(expenseId);
        if (cancelled) return;
        setExpense(data);
        if (data.scope === "PROJECT" && data.projectId) {
          const name = await getProject(data.projectId)
            .then((p) => p.name)
            .catch(() => "Project");
          if (!cancelled) setProjectName(name);
        } else {
          setProjectName("General");
        }
        if (data.documentId) {
          const meta = await getExpenseDocument(expenseId).catch(() => null);
          if (!cancelled) setDocMeta(meta);
        } else {
          setDocMeta(null);
        }
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Expense not found."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Load the review decision from the expenseApprovals audit log whenever the
  // expense is in a reviewed state (also re-runs after an in-session approve/reject).
  useEffect(() => {
    let cancelled = false;
    const reviewed =
      expense?.approvalStatus === "APPROVED" ||
      expense?.approvalStatus === "REJECTED";
    if (expense && reviewed) {
      getExpenseReviewInfo(expense.id)
        .then((info) => {
          if (!cancelled) setReviewInfo(info);
        })
        .catch(() => {
          /* fall back to denormalized fields on the expense */
        });
    } else {
      // Clear stale review info off the synchronous effect path.
      Promise.resolve().then(() => {
        if (!cancelled) setReviewInfo(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [expense?.id, expense?.approvalStatus]);

  const isPending =
    expense?.approvalStatus === "SUBMITTED" ||
    expense?.approvalStatus === "PENDING_REVIEW";
  const canReview = user?.role === "HR" && isPending;
  const isOwner = user?.role === "EMPLOYEE" && expense?.employeeId === user.id;
  const isOwnerDraft = isOwner && expense?.approvalStatus === "DRAFT";
  const isOwnerRejected = isOwner && expense?.approvalStatus === "REJECTED";
  // Manual = entered without a receipt → no AI extraction, no receipt to review.
  const isManual =
    expense?.creationMethod === "MANUAL" || !expense?.documentId;
  const [deleting, setDeleting] = useState(false);

  async function handleSubmitDraft() {
    if (!expense) return;
    setReviewing(true);
    try {
      const updated = await submitExpense(expense.id);
      setExpense(updated);
      toast.success("Expense submitted for review.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to submit."));
    } finally {
      setReviewing(false);
    }
  }

  async function handleResubmit() {
    if (!expense) return;
    setReviewing(true);
    try {
      const updated = await submitExpense(expense.id);
      setExpense(updated);
      toast.success("Expense resubmitted for review.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to resubmit."));
    } finally {
      setReviewing(false);
    }
  }

  async function handleDeleteDraft() {
    if (!expense) return;
    setDeleting(true);
    try {
      await deleteExpense(expense.id);
      toast.success("Draft deleted.");
      navigate("/employee/expenses");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete draft."));
      setDeleting(false);
    }
  }

  async function handleReview(action: "approve" | "reject") {
    if (!expense) return;
    if (action === "reject" && remarks.trim() === "") {
      toast.error("A reason is required to reject.");
      return;
    }
    setReviewing(true);
    try {
      const updated =
        action === "approve"
          ? await approveExpense(expense.id, remarks.trim())
          : await rejectExpense(expense.id, remarks.trim());
      setExpense(updated);
      toast.success(action === "approve" ? "Expense approved." : "Expense rejected.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to submit review."));
    } finally {
      setReviewing(false);
    }
  }

  async function handleStartReview() {
    if (!expense) return;
    setReviewing(true);
    try {
      const updated = await startExpenseReview(expense.id);
      setExpense(updated);
      toast.success("Marked as under review.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to start review."));
    } finally {
      setReviewing(false);
    }
  }

  async function handleViewDocument() {
    if (!expense) return;
    setDocViewing(true);
    try {
      await viewExpenseDocument(expense.id);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't open the document."));
    } finally {
      setDocViewing(false);
    }
  }

  async function handleDownloadDocument() {
    if (!expense) return;
    setDocDownloading(true);
    try {
      await downloadExpenseDocument(
        expense.id,
        docMeta?.originalFileName ?? "document",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't download the document."));
    } finally {
      setDocDownloading(false);
    }
  }

  return (
    <>
      <PageHeader
        title={expense?.code ? `Expense ${expense.code}` : "Expense Details"}
        breadcrumbs={[
          { label: "Expenses", to: `${base}/expenses` },
          { label: expense?.code ?? "Details" },
        ]}
        actions={
          expense && expense.approvalStatus !== "DRAFT" ? (
            <Link
              to={`${base}/expenses/${expense.id}/report`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Printer className="size-4" />
              Export PDF
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState label="Loading expense…" />
      ) : error || !expense ? (
        <ErrorState
          title="Expense unavailable"
          description={error ?? "This expense could not be found."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : user?.role === "HR" && isManual ? (
        // Manual expense — no receipt, no AI extraction. Full-width review of the
        // submitted values (no empty receipt panel).
        <div className="flex flex-col gap-4">
          <ReviewSummaryCard
            expense={expense}
            projectName={projectName}
            docMeta={docMeta}
            onDownload={handleDownloadDocument}
            downloading={docDownloading}
          />
          <ManualReviewNote method={expense.creationMethod} />
          {(expense.approvalStatus === "APPROVED" ||
            expense.approvalStatus === "REJECTED") && (
            <DecisionCard expense={expense} reviewInfo={reviewInfo} />
          )}
          {canReview && (
            <ReviewActions
              expense={expense}
              remarks={remarks}
              setRemarks={setRemarks}
              reviewing={reviewing}
              onStartReview={handleStartReview}
              onReview={handleReview}
            />
          )}
        </div>
      ) : user?.role === "HR" ? (
        // HR review workbench: receipt on the left, AI audit trail and approval
        // controls on the right — review and decide without navigating.
        <ReviewWorkbench expense={expense}>
          <ReviewSummaryCard
            expense={expense}
            projectName={projectName}
            docMeta={docMeta}
            onDownload={handleDownloadDocument}
            downloading={docDownloading}
          />
          {expense.approvalStatus !== "DRAFT" && (
            <AnalysisAuditPanel expense={expense} showRisk />
          )}
          {(expense.approvalStatus === "APPROVED" ||
            expense.approvalStatus === "REJECTED") && (
            <DecisionCard expense={expense} reviewInfo={reviewInfo} />
          )}
          {canReview && (
            <ReviewActions
              expense={expense}
              remarks={remarks}
              setRemarks={setRemarks}
              reviewing={reviewing}
              onStartReview={handleStartReview}
              onReview={handleReview}
            />
          )}
        </ReviewWorkbench>
      ) : user?.role === "ADMIN" ? (
        // Admin oversight: a summary + final decision, plus a collapsible AI Audit
        // for investigation. Admin does not approve/reject (HR does) and manages
        // reimbursement on the dedicated Reimbursements screen.
        <div className="expense-scope flex flex-col gap-4">
          <ReviewSummaryCard
            expense={expense}
            projectName={projectName}
            docMeta={docMeta}
            onDownload={handleDownloadDocument}
            downloading={docDownloading}
          />
          {(expense.approvalStatus === "APPROVED" ||
            expense.approvalStatus === "REJECTED") && (
            <DecisionCard expense={expense} reviewInfo={reviewInfo} />
          )}
          {isManual ? (
            <ManualReviewNote method={expense.creationMethod} />
          ) : (
            <AiAuditCard expense={expense} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-2xl tracking-tight">
                  {formatMoney(expense.amount, expense.currency)}
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  {CATEGORY_LABELS[expense.category]} · {projectName}
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <ApprovalStatusBadge status={expense.approvalStatus} />
                <ReimbursementBadge status={expense.reimbursementStatus} />
                <CreationMethodBadge method={expense.creationMethod} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Type" value={TYPE_LABELS[expense.type]} />
                <Field
                  label="Expense date"
                  value={formatDate(expense.expenseDate)}
                />
                <Field label="Submitted" value={formatDate(expense.createdAt)} />
                <Field label="Project" value={projectName} />
                <Field label="Category" value={CATEGORY_LABELS[expense.category]} />
                <div className="flex flex-col gap-1">
                  <dt className="text-xs font-medium text-muted-foreground">
                    Receipt
                  </dt>
                  <dd>
                    {expense.documentId ? (
                      <div className="flex flex-col gap-2">
                        <span className="truncate text-sm text-foreground">
                          {(expense.documentIds?.length ?? 1) > 1
                            ? `${expense.documentIds!.length} documents`
                            : (docMeta?.originalFileName ?? "1 document")}
                        </span>
                        {(expense.documentIds?.length ?? 1) > 1 && (
                          <span className="text-xs text-muted-foreground">
                            Download saves the primary document.
                          </span>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleViewDocument}
                            disabled={docViewing}
                          >
                            {docViewing ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <FileText className="size-4" />
                            )}
                            View Document
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadDocument}
                            disabled={docDownloading}
                          >
                            {docDownloading ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Download className="size-4" />
                            )}
                            Download
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No document
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Description
                </span>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {expense.description}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* All uploaded documents, viewable inline (owner). */}
          {expense.documentId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <MultiReceiptViewer expenseId={expense.id} />
              </CardContent>
            </Card>
          )}

          {/* AI extraction audit trail for the owner once the expense leaves
              draft (HR/Admin get it in the review workbench above). */}
          {expense.approvalStatus !== "DRAFT" && isOwner && (
            <AnalysisAuditPanel expense={expense} />
          )}

          {(expense.approvalStatus === "APPROVED" ||
            expense.approvalStatus === "REJECTED") && (
            <DecisionCard expense={expense} reviewInfo={reviewInfo} />
          )}

          {isOwnerDraft && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <p className="text-sm text-muted-foreground">
                  This expense is a draft. Edit it, submit it, or delete it.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleDeleteDraft}
                    disabled={deleting || reviewing}
                  >
                    {deleting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Delete
                  </Button>
                  {expense.documentId && (
                    <Link
                      to={`/employee/expenses/${expense.id}/analysis`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Sparkles className="size-4" />
                      Analyze Receipt
                    </Link>
                  )}
                  <Link
                    to={`/employee/expenses/${expense.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                  <Button size="sm" onClick={handleSubmitDraft} disabled={reviewing}>
                    {reviewing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Submit
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isOwnerRejected && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <p className="text-sm text-muted-foreground">
                  This expense was rejected. Review the reason above, then edit
                  and resubmit it for another review.
                </p>
                <div className="flex gap-2">
                  <Link
                    to={`/employee/expenses/${expense.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                  <Button size="sm" onClick={handleResubmit} disabled={reviewing}>
                    {reviewing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Resubmit
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      )}
    </>
  );
}

/** Read-only review decision (approved/rejected) with reviewer + remarks. */
function DecisionCard({
  expense,
  reviewInfo,
}: {
  expense: Expense;
  reviewInfo: ReviewInfo | null;
}) {
  const isRejected = expense.approvalStatus === "REJECTED";
  const reviewedBy = reviewInfo?.reviewerName ?? expense.reviewedByName ?? "—";
  const reviewedOn = reviewInfo?.reviewedAt ?? expense.reviewedAt;
  const remarks = reviewInfo?.remarks ?? expense.reviewRemarks ?? "";
  return (
    <Card
      className={cn(
        "border-l-4",
        isRejected ? "border-l-red-500" : "border-l-emerald-500",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {isRejected ? (
            <X className="size-4 text-red-500" />
          ) : (
            <Check className="size-4 text-emerald-500" />
          )}
          Review Information
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground">Status</dt>
            <dd>
              <ApprovalStatusBadge status={expense.approvalStatus} />
            </dd>
          </div>
          <Field label="Reviewed By" value={reviewedBy} />
          <Field
            label="Reviewed On"
            value={reviewedOn ? formatDate(reviewedOn) : "—"}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {isRejected ? "Rejection Reason" : "Remarks"}
          </span>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {remarks.trim()
              ? remarks
              : isRejected
                ? "No reason provided."
                : "No remarks."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Reviewer-facing note for manual expenses — no receipt, no AI extraction. */
function ManualReviewNote({ method }: { method?: "AI" | "MANUAL" }) {
  return (
    <Card className="border-l-4 border-l-amber-400">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">Manual entry</CardTitle>
        <CreationMethodBadge method={method ?? "MANUAL"} />
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This expense was entered manually with no receipt, so there is no AI
          extraction to cross-check. Verify the submitted values directly —
          additional review may be required.
        </p>
      </CardContent>
    </Card>
  );
}

/** HR-only approve/reject controls (pending expenses). */
function ReviewActions({
  expense,
  remarks,
  setRemarks,
  reviewing,
  onStartReview,
  onReview,
}: {
  expense: Expense;
  remarks: string;
  setRemarks: (v: string) => void;
  reviewing: boolean;
  onStartReview: () => void;
  onReview: (action: "approve" | "reject") => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Review</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {expense.approvalStatus === "SUBMITTED" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">
              Claim this expense to mark it as under review.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={onStartReview}
              disabled={reviewing}
            >
              Start Review
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="remarks">
            Remarks{" "}
            <span className="font-normal text-muted-foreground">
              (required to reject)
            </span>
          </Label>
          <Textarea
            id="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            placeholder="Add a note for the employee…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onReview("reject")}
            disabled={reviewing}
            className="text-destructive hover:text-destructive"
          >
            <X className="size-4" />
            Reject
          </Button>
          <Button onClick={() => onReview("approve")} disabled={reviewing}>
            {reviewing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Approve
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Compact expense summary for the workbench right column (receipt is inline). */
function ReviewSummaryCard({
  expense,
  projectName,
  docMeta,
  onDownload,
  downloading,
}: {
  expense: Expense;
  projectName: string;
  docMeta: ExpenseFileView | null;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-2xl tracking-tight">
            {formatMoney(expense.amount, expense.currency)}
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            {CATEGORY_LABELS[expense.category]} · {projectName}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ApprovalStatusBadge status={expense.approvalStatus} />
          <ReimbursementBadge status={expense.reimbursementStatus} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4">
          <Field label="Type" value={TYPE_LABELS[expense.type]} />
          <Field label="Expense date" value={formatDate(expense.expenseDate)} />
          <Field label="Submitted" value={formatDate(expense.createdAt)} />
          <Field label="Category" value={CATEGORY_LABELS[expense.category]} />
        </dl>
        {expense.description && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Description
            </span>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {expense.description}
            </p>
          </div>
        )}
        {expense.documentId && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download original{docMeta ? ` (${docMeta.originalFileName})` : ""}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
