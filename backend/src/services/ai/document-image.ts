import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { resolveExpenseDocumentFile } from "../expense-document.service";

/** Long-edge cap so the inline base64 stays well under NVIDIA's size limit. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;

export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** Render page 1 of a PDF (from disk) to a PNG buffer via pdf-to-img. */
async function pdfFirstPageToPng(absolutePath: string): Promise<Buffer> {
  // pdf-to-img is ESM-only; dynamic import keeps this CommonJS-friendly.
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(absolutePath, { scale: 2 });
  for await (const page of doc) {
    return page; // first page only
  }
  throw new Error("PDF has no pages to render");
}

/**
 * Resolve a stored document to a Kimi-ready JPEG data URI:
 * - PDF → rasterize page 1 to PNG, then to JPEG
 * - image (incl. webp) → transcode to JPEG
 * Both are downscaled to <= MAX_EDGE on the long side.
 */
export async function toKimiImageDataUri(documentId: string): Promise<string> {
  const file = await resolveExpenseDocumentFile(documentId);

  const sourceBuffer = isPdf(file.mimeType)
    ? await pdfFirstPageToPng(file.absolutePath)
    : await readFile(file.absolutePath);

  const jpeg = await sharp(sourceBuffer)
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
