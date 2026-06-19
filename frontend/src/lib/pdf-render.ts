import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/** Scale PDF pages are rasterized at — high enough to stay readable when zoomed. */
const PDF_RENDER_SCALE = 2;

/** Rasterize a PDF's pages to PNG data URLs. pdf.js is loaded lazily (large). */
export async function renderPdfPages(buf: ArrayBuffer): Promise<string[]> {
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

/** Rasterize only the first page of a PDF to a PNG data URL (for thumbnails). */
export async function renderPdfFirstPage(buf: ArrayBuffer): Promise<string | null> {
  const [first] = await renderPdfPages(buf);
  return first ?? null;
}
