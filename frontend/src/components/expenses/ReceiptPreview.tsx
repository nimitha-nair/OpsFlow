import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchExpenseDocumentObjectUrl,
  getExpenseDocument,
} from "../../lib/expenses-api";

export function ReceiptPreview({ expenseId }: { expenseId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const meta = await getExpenseDocument(expenseId);
        const objUrl = await fetchExpenseDocumentObjectUrl(expenseId, false);
        if (cancelled) {
          URL.revokeObjectURL(objUrl);
          return;
        }
        objectUrl = objUrl;
        setMime(meta.mimeType);
        setUrl(objUrl);
      } catch {
        if (!cancelled) setError("Could not load the receipt preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [expenseId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {error ?? "No receipt to preview"}
      </div>
    );
  }
  if (mime === "application/pdf") {
    return <iframe title="Receipt" src={url} className="h-96 w-full rounded-md border" />;
  }
  return (
    <img
      src={url}
      alt="Receipt"
      className="max-h-96 w-full rounded-md border object-contain"
    />
  );
}
