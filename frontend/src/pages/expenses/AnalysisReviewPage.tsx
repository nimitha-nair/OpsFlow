import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
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
import { ReceiptPreview } from "../../components/expenses/ReceiptPreview";
import { analyzeExpense, getExpenseAnalysis } from "../../lib/expense-analysis-api";
import { getExpense } from "../../lib/expenses-api";
import {
  isTerminalStatus,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";

const POLL_MS = 2000;

export function AnalysisReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [hasDocument, setHasDocument] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
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
        const existing = await getExpenseAnalysis(id);
        setAnalysis(existing);
        if (existing && !isTerminalStatus(existing.status)) {
          timer.current = window.setInterval(poll, POLL_MS);
        }
      } catch {
        toast.error("Could not load expense data.");
      }
    })();
    return stopPolling;
  }, [id, poll, stopPolling]);

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

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptPreview expenseId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">AI analysis</CardTitle>
          {analysis && <AnalysisStatusBadge status={analysis.status} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              AI confidence is low. Please review every field carefully before
              submitting.
            </p>
          )}

          {canVerify && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Vendor" value={analysis?.vendorName} />
              <Field label="Amount" value={analysis?.amount?.toString()} />
              <Field label="Date" value={analysis?.transactionDate} />
              <Field label="Currency" value={analysis?.currency} />
              <Field label="Category" value={analysis?.category} />
              <Field label="Payment method" value={analysis?.paymentMethod} />
              <Field label="Tax info" value={analysis?.taxInformation} />
            </dl>
          )}

          {canVerify && typeof analysis?.confidenceScore === "number" && (
            <ConfidenceMeter score={analysis.confidenceScore} />
          )}

          {canVerify && (
            <Button onClick={() => navigate(`/employee/expenses/${id}/verify`)}>
              Verify &amp; edit →
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
