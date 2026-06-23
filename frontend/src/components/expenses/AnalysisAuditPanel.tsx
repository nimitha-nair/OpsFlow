import { useEffect, useState } from "react";
import { Bot, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { AnalysisStatusBadge } from "./AnalysisStatusBadge";
import { AnalysisBreakdown } from "./AnalysisBreakdown";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { LowConfidenceBanner } from "./LowConfidenceBanner";
import { MockAnalysisBadge } from "./MockAnalysisBadge";
import { RiskAssessment } from "./RiskAssessment";
import { getExpenseAnalysis } from "../../lib/expense-analysis-api";
import { formatDateTime } from "../../lib/format";
import {
  AUDIT_FIELDS,
  auditDisplay,
  deriveLowConfidenceReason,
  isCorrected,
  type AuditFieldKey,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";
import { CATEGORY_LABELS, type Expense } from "../../types/expense";

/** The canonical final value shown to reviewers — the expense is the source of truth. */
function finalValue(
  key: AuditFieldKey,
  expense: Expense,
  corrected: string | number | null | undefined,
): string | number | null | undefined {
  switch (key) {
    case "amount":
      return expense.amount;
    case "currency":
      return expense.currency;
    case "transactionDate":
      return expense.expenseDate;
    case "category":
      return CATEGORY_LABELS[expense.category];
    // vendor / payment method / tax info are not stored on the expense, so the
    // employee-confirmed analysis value is the de-facto final value.
    default:
      return corrected;
  }
}

/**
 * Read-only AI audit trail for HR/Admin (and the owner). Shows the receipt-derived
 * extraction, confidence, provider, model version, low-confidence reason, and a
 * three-way comparison of AI vs employee corrections vs the final submitted values.
 * Self-hides when an expense was entered manually (no analysis exists).
 */
export function AnalysisAuditPanel({
  expense,
  showTechnical = false,
  showRisk = false,
}: {
  expense: Expense;
  /** Admin-only: reveal AI implementation details (provider, model, mock flag). */
  showTechnical?: boolean;
  /** HR/Admin only: reveal the receipt authenticity/risk assessment. */
  showRisk?: boolean;
}) {
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getExpenseAnalysis(expense.id)
      .then((a) => {
        if (!cancelled) setAnalysis(a);
      })
      .catch(() => {
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expense.id]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading AI analysis…
        </CardContent>
      </Card>
    );
  }

  // No analysis → manually-entered expense; nothing to audit.
  if (!analysis) return null;

  const ai = analysis.aiExtraction;
  const provider =
    analysis.provider === "mock" ? "Mock" : analysis.provider === "kimi" ? "Kimi" : "—";

  return (
    <Card className="border-l-4 border-l-indigo-400">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="size-4 text-indigo-500" />
          AI extraction &amp; audit trail
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {showTechnical && analysis.provider === "mock" && <MockAnalysisBadge />}
          <AnalysisStatusBadge status={analysis.status} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {showRisk && <RiskAssessment analysis={analysis} />}
        {analysis.status === "LOW_CONFIDENCE" && (
          <LowConfidenceBanner reason={deriveLowConfidenceReason(analysis)} />
        )}
        {typeof analysis.confidenceScore === "number" && (
          <ConfidenceMeter score={analysis.confidenceScore} />
        )}

        <AnalysisBreakdown
          documents={analysis.documents}
          currency={analysis.currency}
        />

        {/* Provenance metadata. Provider/model are AI implementation details —
            shown only in the Admin AI audit (showTechnical). */}
        <dl
          className={`grid grid-cols-2 gap-y-1 rounded-md border bg-muted/20 px-3 py-2.5 text-xs ${
            showTechnical ? "sm:grid-cols-4" : "sm:grid-cols-2"
          }`}
        >
          {showTechnical && <Meta label="Provider" value={provider} />}
          {showTechnical && (
            <Meta label="Model version" value={analysis.modelVersion || "—"} />
          )}
          <Meta label="Analyzed" value={formatDateTime(analysis.updatedAt)} />
          <Meta
            label="Confirmed"
            value={analysis.confirmedAt ? formatDateTime(analysis.confirmedAt) : "Not confirmed"}
          />
        </dl>

        {/* Three-way comparison: Receipt (AI) vs Employee corrections vs Final. */}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">AI extracted</th>
                <th className="px-3 py-2 font-medium">Employee corrected</th>
                <th className="px-3 py-2 font-medium">Final submitted</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT_FIELDS.map(({ key, label }) => {
                const aiVal = ai ? ai[key] : undefined;
                const corrected = analysis[key as keyof ExpenseAnalysis] as
                  | string
                  | number
                  | undefined;
                const changed = ai ? isCorrected(aiVal, corrected) : false;
                const fin = finalValue(key, expense, corrected);
                return (
                  <tr
                    key={key}
                    className={`border-b last:border-b-0 ${changed ? "bg-amber-50/60" : ""}`}
                  >
                    <td className="px-3 py-2 text-muted-foreground">{label}</td>
                    <td className="px-3 py-2">{auditDisplay(aiVal)}</td>
                    <td className="px-3 py-2">
                      <span className={changed ? "font-semibold text-amber-700" : ""}>
                        {auditDisplay(corrected)}
                      </span>
                      {changed && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-medium uppercase text-amber-700">
                          edited
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {auditDisplay(fin)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!ai && (
          <p className="text-xs text-muted-foreground">
            This analysis predates audit snapshotting, so the original AI values
            and per-field edits can't be reconstructed. The “AI extracted” column
            shows the stored values.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Read-only. Amber rows were changed by the employee after AI extraction.
          AI confidence is advisory — the reviewer makes the final decision.
        </p>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
