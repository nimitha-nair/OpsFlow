import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { ReceiptViewer } from "./ReceiptViewer";
import { listExpenseDocuments } from "../../lib/expenses-api";
import type { ExpenseFileView } from "../../types/expense";

/**
 * Multi-document receipt viewer. Lists every document attached to the expense and
 * renders the selected one in the full-featured {@link ReceiptViewer} (zoom, PDF
 * pages, fullscreen). When more than one document exists it shows a switcher and a
 * "Document X of N" indicator so it's always clear which file is on screen.
 * Degrades to a plain single viewer for one document.
 */
export function MultiReceiptViewer({ expenseId }: { expenseId: string }) {
  const [docs, setDocs] = useState<ExpenseFileView[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listExpenseDocuments(expenseId);
        if (!cancelled) setDocs(list);
      } catch {
        if (!cancelled) setError("Could not load the receipts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || docs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {error ?? "No receipt to preview"}
      </div>
    );
  }

  const current = docs[Math.min(selected, docs.length - 1)]!;

  return (
    <div className="flex flex-col gap-3">
      {docs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Document {selected + 1} of {docs.length}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(i)}
                aria-current={i === selected}
                aria-label={`View ${d.originalFileName}`}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                  i === selected
                    ? "ring-ai border-[var(--x-ai)] font-medium"
                    : "hover:border-muted-foreground/50"
                }`}
                title={d.originalFileName}
              >
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="max-w-32 truncate">{d.originalFileName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <ReceiptViewer
        key={current.id}
        expenseId={expenseId}
        documentId={current.id}
        mimeType={current.mimeType}
      />
    </div>
  );
}
