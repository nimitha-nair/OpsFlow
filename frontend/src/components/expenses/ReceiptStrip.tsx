import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import {
  fetchExpenseDocByIdObjectUrl,
  listExpenseDocuments,
} from "../../lib/expenses-api";
import type { ExpenseFileView } from "../../types/expense";

/**
 * Multi-document receipt viewer: a main preview pane plus a thumbnail strip for
 * every document attached to the expense. Selecting a thumbnail loads that
 * document's bytes into the pane. Degrades to a single preview when one document.
 */
export function ReceiptStrip({ expenseId }: { expenseId: string }) {
  const [docs, setDocs] = useState<ExpenseFileView[]>([]);
  const [selected, setSelected] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the document list once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listExpenseDocuments(expenseId);
        if (!cancelled) setDocs(list);
      } catch {
        if (!cancelled) setError("Could not load the receipts.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  // Load the selected document's bytes whenever the selection changes.
  const current = docs[selected];
  useEffect(() => {
    if (!current) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      setLoadingDoc(true);
      try {
        const u = await fetchExpenseDocByIdObjectUrl(expenseId, current.id);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      } catch {
        if (!cancelled) setError("Could not load this document.");
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [expenseId, current]);

  if (loadingList) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error && docs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {error}
      </div>
    );
  }
  if (docs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        No receipt to preview
      </div>
    );
  }

  const isPdf = current?.mimeType === "application/pdf";

  return (
    <div className="flex flex-col gap-3">
      <div className="relative min-h-64">
        {loadingDoc && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-muted/40">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {url && isPdf ? (
          <iframe
            title={current?.originalFileName ?? "Receipt"}
            src={url}
            className="h-96 w-full rounded-md border"
          />
        ) : url ? (
          <img
            src={url}
            alt={current?.originalFileName ?? "Receipt"}
            className="max-h-96 w-full rounded-md border object-contain"
          />
        ) : (
          <div className="h-64 rounded-md border bg-muted/30" />
        )}
      </div>

      {docs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {docs.map((d, i) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`View ${d.originalFileName}`}
              aria-current={i === selected}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                i === selected
                  ? "ring-ai border-[var(--x-ai)]"
                  : "hover:border-muted-foreground/50"
              }`}
              title={d.originalFileName}
            >
              <FileText className="size-3.5 text-muted-foreground" />
              <span className="max-w-28 truncate">{d.originalFileName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
