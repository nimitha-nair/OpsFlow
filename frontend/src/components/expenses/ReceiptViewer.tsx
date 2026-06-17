import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Maximize2,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { Button } from "../ui/button";
import {
  fetchExpenseDocumentObjectUrl,
  getExpenseDocument,
} from "../../lib/expenses-api";
import { ZOOM_MAX, ZOOM_MIN, nextZoom } from "../../lib/viewer-zoom";

/** Scale PDF pages are rasterized at — high enough to stay readable when zoomed. */
const PDF_RENDER_SCALE = 2;

/** Rasterize a PDF's pages to PNG data URLs. pdf.js is loaded lazily (large). */
async function renderPdfPages(buf: ArrayBuffer): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const urls: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL("image/png"));
  }
  return urls;
}

/**
 * Unified receipt viewer: renders both images and PDFs as page images inside one
 * zoomable, independently-scrollable, fullscreen-capable shell. Each page wraps an
 * absolutely-positioned overlay layer reserved for future field-highlighting.
 */
export function ReceiptViewer({ expenseId }: { expenseId: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitWidth, setFitWidth] = useState(true);
  const [isFull, setIsFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let imageObjectUrl: string | null = null;
    (async () => {
      try {
        const meta = await getExpenseDocument(expenseId);
        const objUrl = await fetchExpenseDocumentObjectUrl(expenseId, false);
        if (meta.mimeType === "application/pdf") {
          const buf = await fetch(objUrl).then((r) => r.arrayBuffer());
          URL.revokeObjectURL(objUrl);
          const urls = await renderPdfPages(buf);
          if (!cancelled) setPages(urls);
        } else {
          imageObjectUrl = objUrl;
          if (cancelled) {
            URL.revokeObjectURL(objUrl);
            return;
          }
          setPages([objUrl]);
        }
      } catch {
        if (!cancelled) setError("Could not load the receipt.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    };
  }, [expenseId]);

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const zoomBy = useCallback((dir: "in" | "out") => {
    setFitWidth(false);
    setZoom((z) => nextZoom(z, dir));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  const contentWidth = fitWidth ? "100%" : `${Math.round(zoom * 100)}%`;

  return (
    <div
      ref={rootRef}
      className={`flex ${isFull ? "h-screen" : "h-[72vh]"} flex-col overflow-hidden rounded-md border bg-background`}
    >
      <div className="flex items-center gap-1 border-b bg-muted/40 p-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => zoomBy("out")}
          disabled={!fitWidth && zoom <= ZOOM_MIN}
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => zoomBy("in")}
          disabled={!fitWidth && zoom >= ZOOM_MAX}
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>
        <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
          {fitWidth ? "Fit" : `${Math.round(zoom * 100)}%`}
        </span>
        <Button
          variant={fitWidth ? "secondary" : "outline"}
          size="sm"
          onClick={() => setFitWidth(true)}
          title="Fit width"
        >
          <MoveHorizontal className="size-4" />
          Fit width
        </Button>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            title="Open fullscreen"
          >
            <Maximize2 className="size-4" />
            Fullscreen
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || pages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {error ?? "No receipt to preview"}
          </div>
        ) : (
          <div
            className="mx-auto flex flex-col gap-3"
            style={{ width: contentWidth, maxWidth: "100%" }}
          >
            {pages.map((src, i) => (
              <div key={i} className="relative shadow-sm">
                <img
                  src={src}
                  alt={`Receipt page ${i + 1}`}
                  className="block h-auto w-full rounded-sm border bg-white"
                />
                {/* Overlay layer reserved for future field-highlighting (#12). */}
                <div
                  className="pointer-events-none absolute inset-0"
                  data-overlay-layer
                  aria-hidden
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
