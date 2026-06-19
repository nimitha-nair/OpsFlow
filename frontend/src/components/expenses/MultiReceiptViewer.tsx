import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReceiptViewer } from "./ReceiptViewer";
import { listExpenseDocuments } from "../../lib/expenses-api";
import type { ExpenseFileView } from "../../types/expense";

/**
 * Multi-document receipt viewer. Lists every document attached to the expense and
 * renders the selected one in the full-featured {@link ReceiptViewer} (zoom, PDF
 * pages, fullscreen), with a switcher + "Document X of N" when there is more than
 * one. Resilient: a failed list load shows an actionable retry, and a single
 * document that fails to render falls back to the next one automatically.
 */
export function MultiReceiptViewer({ expenseId }: { expenseId: string }) {
  const [docs, setDocs] = useState<ExpenseFileView[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  // Document ids that failed to render — skipped during fallback.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setListError(false);
      setFailed(new Set());
      setSelected(0);
      try {
        const list = await listExpenseDocuments(expenseId);
        if (!cancelled) setDocs(list);
      } catch {
        if (!cancelled) setListError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId, reloadKey]);

  // When a document fails to render, mark it by id; the displayed index (below)
  // then falls back to the next good document — no extra setState effect needed.
  const handleDocError = useCallback((docId?: string) => {
    if (!docId) return;
    setFailed((prev) => {
      if (prev.has(docId)) return prev;
      const next = new Set(prev);
      next.add(docId);
      return next;
    });
  }, []);

  const retry = () => setReloadKey((k) => k + 1);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allFailed = docs.length > 0 && docs.every((d) => failed.has(d.id));

  if (listError || docs.length === 0 || allFailed) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-md border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {docs.length === 0 && !listError
            ? "No receipt to preview."
            : "Unable to load the receipt preview. The document was analyzed successfully, but the preview couldn't be displayed."}
        </p>
        {(listError || allFailed) && (
          <Button variant="outline" size="sm" onClick={retry}>
            <RefreshCw className="size-4" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  // If the selected document failed to render, fall back to the next good one.
  const clamped = Math.min(selected, docs.length - 1);
  const clampedId = docs[clamped]!.id;
  const fallbackIndex = failed.has(clampedId)
    ? docs.findIndex((d) => !failed.has(d.id))
    : clamped;
  const current = docs[fallbackIndex >= 0 ? fallbackIndex : clamped]!;

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
                } ${failed.has(d.id) ? "opacity-50" : ""}`}
                title={
                  failed.has(d.id)
                    ? `${d.originalFileName} (preview unavailable)`
                    : d.originalFileName
                }
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
        onError={handleDocError}
      />
    </div>
  );
}
