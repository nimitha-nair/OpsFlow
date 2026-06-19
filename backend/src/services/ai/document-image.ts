import sharp from "sharp";

import { resolveExpenseDocumentFile } from "../expense-document.service";

/** Long-edge cap so the inline base64 stays well under NVIDIA's size limit. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;

export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** Default cap on PDF pages rasterized for analysis. */
export const MAX_PDF_PAGES = 3;

/** Render up to `maxPages` pages of a PDF (from a byte buffer) to PNG buffers. */
async function pdfPagesToPng(bytes: Buffer, maxPages: number): Promise<Buffer[]> {
  // pdf-to-img is ESM-only; dynamic import keeps this CommonJS-friendly. It
  // accepts a Buffer directly, so this works for both local-disk and Firebase
  // Storage backends without needing an on-disk path.
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(bytes, { scale: 2 });
  const out: Buffer[] = [];
  for await (const page of doc) {
    out.push(page);
    if (out.length >= maxPages) break;
  }
  if (out.length === 0) {
    throw new Error("PDF has no pages to render");
  }
  return out;
}

/** Downscale + transcode a single image/PNG buffer to a Kimi-ready JPEG data URI. */
async function toJpegDataUri(source: Buffer): Promise<string> {
  const jpeg = await sharp(source)
    .rotate() // honor EXIF orientation
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/**
 * Convert raw document bytes to 1..N Kimi-ready JPEG data URIs:
 * - PDF → rasterize up to `maxPages` pages, each to JPEG
 * - image (incl. webp) → a single transcoded JPEG
 * All are downscaled to <= MAX_EDGE on the long side. Backend-agnostic — the
 * caller supplies the bytes (local disk, Firebase Storage, or a test/CLI buffer).
 */
export async function bytesToKimiJpegDataUris(
  bytes: Buffer,
  mimeType: string,
  maxPages = MAX_PDF_PAGES,
): Promise<string[]> {
  const sources = isPdf(mimeType)
    ? await pdfPagesToPng(bytes, maxPages)
    : [bytes];
  return Promise.all(sources.map(toJpegDataUri));
}

/**
 * Back-compat single-image (page 1) wrapper around {@link bytesToKimiJpegDataUris}.
 */
export async function bytesToKimiJpegDataUri(
  bytes: Buffer,
  mimeType: string,
): Promise<string> {
  const [first] = await bytesToKimiJpegDataUris(bytes, mimeType, 1);
  return first!;
}

/**
 * Resolve a stored document to a Kimi-ready JPEG data URI. Reads bytes through the
 * backend-agnostic resolver, so it works with either the local-disk or Firebase
 * Storage backend.
 */
export async function toKimiImageDataUri(documentId: string): Promise<string> {
  const file = await resolveExpenseDocumentFile(documentId);
  const bytes = await file.read();
  return bytesToKimiJpegDataUri(bytes, file.mimeType);
}
