import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { AnalysisStatusBadge } from "../../components/expenses/AnalysisStatusBadge";
import { ConfidenceMeter } from "../../components/expenses/ConfidenceMeter";
import { LowConfidenceBanner } from "../../components/expenses/LowConfidenceBanner";
import { MultiReceiptViewer } from "../../components/expenses/MultiReceiptViewer";
import { AnalysisBreakdown } from "../../components/expenses/AnalysisBreakdown";
import { analyzeExpense, getExpenseAnalysis } from "../../lib/expense-analysis-api";
import { getExpense } from "../../lib/expenses-api";
import { confirmAndSubmitExpense } from "../../lib/expense-submit";
import { getProject } from "../../lib/projects-api";
import {
  combinedVendorLabel,
  deriveLowConfidenceReason,
  isTerminalStatus,
  mapToExpenseCategory,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";
import type { ExpenseScope } from "../../types/expense";

const POLL_MS = 2000;

export function AnalysisReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const autoStart = params.get("analyze") === "1";
  const [hasDocument, setHasDocument] = useState<boolean | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [scope, setScope] = useState<ExpenseScope | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    const next = await getExpenseAnalysis(id);
    setAnalysis(next);
    if (next && isTerminalStatus(next.status)) stopPolling();
  }, [id, stopPolling]);

  useEffect(() => {
    (async () => {
      try {
        const expense = await getExpense(id);
        setHasDocument(Boolean(expense.documentId));
        setScope(expense.scope);
        setProjectId(expense.projectId ?? "");
        if (expense.scope === "PROJECT" && expense.projectId) {
          getProject(expense.projectId)
            .then((p) => setProjectName(p.name))
            .catch(() => undefined);
        }
        const existing = await getExpenseAnalysis(id);
        setAnalysis(existing);
        if (existing && !isTerminalStatus(existing.status)) {
          timer.current = window.setInterval(poll, POLL_MS);
        } else if (!existing && expense.documentId && autoStart) {
          // Seamless "Save & Analyze": kick off the run on arrival, no extra click.
          const started = await analyzeExpense(id);
          setAnalysis(started);
          if (!isTerminalStatus(started.status)) {
            timer.current = window.setInterval(poll, POLL_MS);
          }
        }
      } catch {
        toast.error("Could not load expense data.");
      }
    })();
    return stopPolling;
  }, [id, poll, stopPolling, autoStart]);

  const onAnalyze = async () => {
    setBusy(true);
    try {
      const started = await analyzeExpense(id);
      setAnalysis(started);
      if (!isTerminalStatus(started.status)) {
        stopPolling();
        timer.current = window.setInterval(poll, POLL_MS);
      }
    } catch {
      toast.error("Could not start analysis.");
    } finally {
      setBusy(false);
    }
  };

  const canVerify =
    analysis?.status === "COMPLETED" || analysis?.status === "LOW_CONFIDENCE";
  const goEdit = () => navigate(`/employee/expenses/${id}/verify`);

  // The fast-path "Submit" sends AI-extracted values straight to approval. It is
  // only offered when the required fields are already valid; otherwise the user
  // is steered to "Edit" to complete them.
  const needsProject = scope === "PROJECT" && !projectId;
  const hasAmount = (analysis?.amount ?? 0) > 0;
  const hasVendor = (analysis?.vendorName ?? "").trim() !== "";
  const canFastSubmit = Boolean(canVerify && !needsProject && hasAmount && hasVendor);

  const submitNow = async () => {
    setSubmitting(true);
    try {
      await confirmAndSubmitExpense(id, {
        vendorName: analysis?.vendorName || undefined,
        amount: analysis?.amount ?? undefined,
        transactionDate: analysis?.transactionDate || undefined,
        currency: analysis?.currency || undefined,
        paymentMethod: analysis?.paymentMethod || undefined,
        category: mapToExpenseCategory(analysis?.category) || undefined,
        taxInformation: analysis?.taxInformation || undefined,
        // AI-first drafts have no description; default to the vendor.
        description: analysis?.vendorName || undefined,
        projectId: projectId || undefined,
      });
      toast.success("Expense submitted for approval.");
      navigate(`/employee/expenses/${id}`);
    } catch {
      toast.error("Could not submit — open Edit to review the details.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/employee/expenses/${id}`)}
        >
          <ArrowLeft className="size-4" />
          Back to expense
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
      {/* Receipt panel — ~60% */}
      <Card className="overflow-hidden lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Receipt</CardTitle>
          {projectName && (
            <span className="truncate text-sm text-muted-foreground">
              Project · {projectName}
            </span>
          )}
        </CardHeader>
        <CardContent>
          <MultiReceiptViewer expenseId={id} />
        </CardContent>
      </Card>

      {/* AI analysis panel — ~40% */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">AI analysis</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {analysis &&
              isTerminalStatus(analysis.status) &&
              analysis.status !== "FAILED" &&
              hasDocument && (
                <Button variant="ghost" size="sm" onClick={onAnalyze} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Reanalyze
                </Button>
              )}
            {analysis && <AnalysisStatusBadge status={analysis.status} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {hasDocument === false && (
            <p className="text-sm text-muted-foreground">
              Upload a receipt to this expense to enable AI analysis.
            </p>
          )}

          {hasDocument && !analysis && (
            <Button onClick={onAnalyze} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Analyze Receipt
            </Button>
          )}

          {analysis?.status === "FAILED" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-red-600">
                {analysis.failureReason ?? "Analysis failed."}
              </p>
              <div className="flex gap-2">
                <Button onClick={onAnalyze} disabled={busy} variant="outline">
                  Retry
                </Button>
                <Button
                  onClick={() => navigate(`/employee/expenses/${id}/edit`)}
                  variant="ghost"
                >
                  Enter manually
                </Button>
              </div>
            </div>
          )}

          {analysis && (analysis.status === "PENDING" || analysis.status === "PROCESSING") && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading your receipt — this can take a few seconds.
            </p>
          )}

          {analysis?.status === "LOW_CONFIDENCE" && (
            <LowConfidenceBanner reason={deriveLowConfidenceReason(analysis)} />
          )}

          {canVerify && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Extracted details
              </h3>
              <dl className="overflow-hidden rounded-md border">
                <Row
                  label="Vendor"
                  value={combinedVendorLabel(
                    analysis?.documents,
                    analysis?.vendorName,
                  )}
                />
                <Row label="Amount" value={analysis?.amount?.toString()} />
                <Row label="Date" value={analysis?.transactionDate} />
                <Row label="Currency" value={analysis?.currency} />
                <Row label="Category" value={analysis?.category} />
                <Row label="Payment method" value={analysis?.paymentMethod} />
                <Row label="Tax info" value={analysis?.taxInformation} />
              </dl>
            </section>
          )}

          {canVerify && (
            <AnalysisBreakdown
              documents={analysis?.documents}
              currency={analysis?.currency}
            />
          )}

          {/* Confidence below the extracted fields (#7). */}
          {canVerify && typeof analysis?.confidenceScore === "number" && (
            <ConfidenceMeter score={analysis.confidenceScore} />
          )}

          {canVerify && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button onClick={submitNow} disabled={submitting || !canFastSubmit}>
                  {submitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Submit
                </Button>
                <Button variant="outline" onClick={goEdit} disabled={submitting}>
                  Edit
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {!canFastSubmit
                  ? needsProject
                    ? "Choose a project allocation in Edit before submitting."
                    : "Some details need review — open Edit to complete them."
                  : "Submit sends these values for approval, or Edit to adjust them first."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-3 py-2.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value || "—"}</dd>
    </div>
  );
}
