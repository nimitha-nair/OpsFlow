import { Layers } from "lucide-react";

import { formatMoney } from "../../lib/format";
import type { PerDocumentExtraction } from "../../types/expenseAnalysis";

/**
 * Per-document breakdown for a multi-document expense, presented as an explicit
 * "merged expense": one line per uploaded file (vendor / date / amount) summing
 * to a prominent combined total. Renders nothing for a single-document analysis.
 */
export function AnalysisBreakdown({
  documents,
  currency = "INR",
}: {
  documents?: PerDocumentExtraction[];
  currency?: string;
}) {
  if (!documents || documents.length < 2) return null;

  const combined = documents.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--x-ai)]/40">
      <header className="flex items-center gap-2 bg-ai-soft px-3 py-2">
        <Layers className="size-4 text-ai" />
        <span className="text-sm font-semibold text-foreground">
          Merged from {documents.length} documents
        </span>
      </header>
      <ul className="divide-y">
        {documents.map((d, i) => (
          <li
            key={d.documentId}
            className="flex items-start justify-between gap-3 px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">
                Document {i + 1}
                {d.vendorName ? ` · ${d.vendorName}` : ""}
              </span>
              {d.transactionDate && (
                <span className="text-xs text-muted-foreground">
                  {d.transactionDate}
                </span>
              )}
            </div>
            <span className="shrink-0 tabular-nums text-sm font-medium text-foreground">
              {d.amount != null
                ? formatMoney(d.amount, d.currency ?? currency)
                : "—"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/50 px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">
          Combined total
        </span>
        <span className="tabular-nums text-base font-bold text-foreground">
          {formatMoney(combined, currency)}
        </span>
      </div>
    </section>
  );
}
