import { formatMoney } from "../../lib/format";
import type { PerDocumentExtraction } from "../../types/expenseAnalysis";

/**
 * Per-document breakdown for a multi-document analysis: one row per uploaded file
 * (vendor / amount / date) plus the combined total (sum of the per-document
 * amounts). Renders nothing for a single-document analysis.
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
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Per-document breakdown
      </h3>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <tbody>
            {documents.map((d, i) => (
              <tr key={d.documentId} className="border-b last:border-b-0">
                <td className="px-3 py-2 text-muted-foreground">
                  Document {i + 1}
                  {d.vendorName ? (
                    <span className="ml-1 text-foreground">· {d.vendorName}</span>
                  ) : null}
                  {d.transactionDate ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({d.transactionDate})
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                  {d.amount != null ? formatMoney(d.amount, d.currency ?? currency) : "—"}
                </td>
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td className="px-3 py-2 font-semibold text-foreground">Combined</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">
                {formatMoney(combined, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
