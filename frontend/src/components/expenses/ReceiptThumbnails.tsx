import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchExpenseDocByIdObjectUrl,
  listExpenseDocuments,
} from "../../lib/expenses-api";
import { renderPdfFirstPage } from "../../lib/pdf-render";

interface Thumb {
  name: string;
  src: string;
  isObjectUrl: boolean;
}

/**
 * Static, print-friendly receipt previews for the expense report. Each document
 * renders as a single image (PDFs → first page rasterized). Unlike the interactive
 * viewer there is no toolbar/scroll, so it prints cleanly.
 */
export function ReceiptThumbnails({ expenseId }: { expenseId: string }) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      try {
        const docs = await listExpenseDocuments(expenseId);
        const out: Thumb[] = [];
        for (const d of docs) {
          try {
            const objUrl = await fetchExpenseDocByIdObjectUrl(expenseId, d.id);
            if (d.mimeType === "application/pdf") {
              const buf = await fetch(objUrl).then((r) => r.arrayBuffer());
              URL.revokeObjectURL(objUrl);
              const page = await renderPdfFirstPage(buf);
              if (page) out.push({ name: d.originalFileName, src: page, isObjectUrl: false });
            } else {
              created.push(objUrl);
              out.push({ name: d.originalFileName, src: objUrl, isObjectUrl: true });
            }
          } catch {
            // Skip a document that can't be previewed; the report still renders.
          }
        }
        if (!cancelled) setThumbs(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [expenseId]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (thumbs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No receipt documents.</p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {thumbs.map((t, i) => (
        <figure key={i} className="flex flex-col gap-1">
          <img
            src={t.src}
            alt={t.name}
            className="max-h-64 w-full rounded-md border bg-white object-contain"
          />
          <figcaption className="truncate text-xs text-muted-foreground">
            {t.name}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
