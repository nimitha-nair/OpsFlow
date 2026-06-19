import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Maximize2,
  MoveHorizontal,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  fetchExpenseDocByIdObjectUrl,
  fetchExpenseDocumentObjectUrl,
  getExpenseDocument,
} from "../../lib/expenses-api";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PRESETS,
  nudgeZoom,
  snapZoom,
} from "../../lib/viewer-zoom";

/** Scale PDF pages are rasterized at — high enough to stay readable when zoomed. */
const PDF_RENDER_SCALE = 2;

type ViewMode = "fitWidth" | "fitPage" | "zoom";

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
    // pdf.js v6 requires `canvas` in RenderParameters (canvasContext alone fails typecheck).
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL("image/png"));
  }
  return urls;
}

/**
 * Unified receipt viewer: renders both images and PDFs as page images inside one
 * zoomable, independently-scrollable, fullscreen-capable shell. Supports discrete
 * zoom presets (50–300%), Fit Width, Fit Page, and Ctrl/⌘ + mouse-wheel zoom. Each
 * page wraps an absolutely-positioned overlay layer reserved for field-highlighting.
 */
export function ReceiptViewer({
  expenseId,
  documentId,
  mimeType,
}: {
  expenseId: string;
  /** Render a specific document; defaults to the expense's primary document. */
  documentId?: string;
  /** MIME of the specific document (required when `documentId` is set). */
  mimeType?: string;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<ViewMode>("fitWidth");
  const [isFull, setIsFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Tracked across both branches so cleanup can revoke it on early unmount.
    let objUrl: string | null = null;
    (async () => {
      try {
        // Render a specific document when given one (multi-document viewer), else
        // fall back to the expense's primary document (legacy single-doc usage).
        const mime = documentId
          ? (mimeType ?? "")
          : (await getExpenseDocument(expenseId)).mimeType;
        objUrl = documentId
          ? await fetchExpenseDocByIdObjectUrl(expenseId, documentId)
          : await fetchExpenseDocumentObjectUrl(expenseId, false);
        if (mime === "application/pdf") {
          const buf = await fetch(objUrl).then((r) => r.arrayBuffer());
          URL.revokeObjectURL(objUrl); // PDF bytes are buffered; the blob URL is done.
          objUrl = null;
          const urls = await renderPdfPages(buf);
          if (!cancelled) setPages(urls);
        } else if (cancelled) {
          URL.revokeObjectURL(objUrl);
          objUrl = null;
        } else {
          // Image stays displayed from objUrl; cleanup revokes it on unmount.
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
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [expenseId, documentId, mimeType]);

  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Ctrl/⌘ + wheel zoom. Registered natively (non-passive) so preventDefault works
  // and the browser's page-zoom gesture doesn't fire instead.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls normally
      e.preventDefault();
      setMode("zoom");
      setZoom((z) => nudgeZoom(z, e.deltaY < 0 ? 0.1 : -0.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomByButton = useCallback(
    (dir: "in" | "out") => {
      setMode("zoom");
      setZoom((z) => snapZoom(mode === "zoom" ? z : 1, dir));
    },
    [mode],
  );

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      rootRef.current?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  const zoomLabel =
    mode === "fitWidth" ? "Fit W" : mode === "fitPage" ? "Fit P" : `${Math.round(zoom * 100)}%`;

  const wrapperStyle =
    mode === "fitWidth"
      ? { width: "100%", maxWidth: "100%" as const }
      : mode === "zoom"
        ? { width: `${Math.round(zoom * 100)}%`, maxWidth: "none" as const }
        : { width: "auto", maxWidth: "100%" as const };

  // In Fit Page, cap each page's height to the viewport so a whole page is visible.
  const pageMaxHeight =
    mode === "fitPage" ? (isFull ? "calc(100vh - 5rem)" : "calc(72vh - 5rem)") : undefined;

  return (
    <div
      ref={rootRef}
      className={`flex ${isFull ? "h-screen" : "h-[72vh]"} flex-col overflow-hidden rounded-md border bg-background`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => zoomByButton("out")}
          disabled={mode === "zoom" && zoom <= ZOOM_MIN}
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
          <span className="sr-only">Zoom out</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => zoomByButton("in")}
          disabled={mode === "zoom" && zoom >= ZOOM_MAX}
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
          <span className="sr-only">Zoom in</span>
        </Button>

        <Select
          value={mode === "zoom" ? String(zoom) : ""}
          onValueChange={(v) => {
            if (!v) return;
            setMode("zoom");
            setZoom(Number(v));
          }}
        >
          <SelectTrigger size="sm" className="w-24" aria-label="Zoom level">
            <SelectValue placeholder={zoomLabel}>{zoomLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ZOOM_PRESETS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {Math.round(p * 100)}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={mode === "fitWidth" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setMode("fitWidth")}
          title="Fit width"
        >
          <MoveHorizontal className="size-4" />
          Fit width
        </Button>
        <Button
          variant={mode === "fitPage" ? "secondary" : "outline"}
          size="sm"
          onClick={() => setMode("fitPage")}
          title="Fit whole page"
        >
          <ScanLine className="size-4" />
          Fit page
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

      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/20 p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error || pages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {error ?? "No receipt to preview"}
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-3" style={wrapperStyle}>
            {pages.map((src, i) => (
              <div key={i} className="relative shadow-sm">
                <img
                  src={src}
                  alt={`Receipt page ${i + 1}`}
                  className="block rounded-sm border bg-white"
                  style={
                    mode === "fitPage"
                      ? { maxHeight: pageMaxHeight, width: "auto", maxWidth: "100%" }
                      : { height: "auto", width: "100%" }
                  }
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
