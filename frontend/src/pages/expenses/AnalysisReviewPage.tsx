import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
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
import { MockAnalysisBadge } from "../../components/expenses/MockAnalysisBadge";
import { MultiReceiptViewer } from "../../components/expenses/MultiReceiptViewer";
import { analyzeExpense, getExpenseAnalysis } from "../../lib/expense-analysis-api";
import { getExpense } from "../../lib/expenses-api";
import { getProject } from "../../lib/projects-api";
import { formatDateTime } from "../../lib/format";
import {
  deriveLowConfidenceReason,
  isTerminalStatus,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";

const POLL_MS = 2000;
const HIGH_CONFIDENCE = 85;

export function AnalysisReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const autoStart = params.get("analyze") === "1";
  const [hasDocument, setHasDocument] = useState<boolean | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
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
  const isHighConfidence = (analysis?.confidenceScore ?? 0) >= HIGH_CONFIDENCE;
  const goVerify = () => navigate(`/employee/expenses/${id}/verify`);

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
            {analysis?.provider === "mock" && <MockAnalysisBadge />}
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
                <Row label="Vendor" value={analysis?.vendorName} />
                <Row label="Amount" value={analysis?.amount?.toString()} />
                <Row label="Date" value={analysis?.transactionDate} />
                <Row label="Currency" value={analysis?.currency} />
                <Row label="Category" value={analysis?.category} />
                <Row label="Payment method" value={analysis?.paymentMethod} />
                <Row label="Tax info" value={analysis?.taxInformation} />
              </dl>
            </section>
          )}

          {/* Confidence below the extracted fields (#7). */}
          {canVerify && typeof analysis?.confidenceScore === "number" && (
            <ConfidenceMeter score={analysis.confidenceScore} />
          )}

          {canVerify && analysis && <ProviderMeta analysis={analysis} />}

          {canVerify && (
            <div className="flex flex-wrap gap-2">
              {isHighConfidence && (
                <Button onClick={goVerify}>Looks Good →</Button>
              )}
              <Button variant={isHighConfidence ? "outline" : "default"} onClick={goVerify}>
                Verify &amp; edit →
              </Button>
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

function ProviderMeta({ analysis }: { analysis: ExpenseAnalysis }) {
  return (
    <section className="rounded-md border bg-muted/20 px-3 py-2.5">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Analysis metadata
      </h3>
      <dl className="grid grid-cols-2 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Provider</dt>
        <dd className="text-right font-medium text-foreground">
          {analysis.provider === "mock" ? "Mock" : analysis.provider === "kimi" ? "Kimi" : "—"}
        </dd>
        <dt className="text-muted-foreground">Model version</dt>
        <dd className="text-right font-medium text-foreground">
          {analysis.modelVersion || "—"}
        </dd>
        <dt className="text-muted-foreground">Analysis time</dt>
        <dd className="text-right font-medium text-foreground">
          {formatDateTime(analysis.updatedAt)}
        </dd>
      </dl>
    </section>
  );
}
