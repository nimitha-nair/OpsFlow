import { resolveExpenseDocumentFile } from "../expense-document.service";
import { bytesToKimiJpegDataUris } from "./document-image";

/** Hard cap on the number of images sent to Kimi in a single extraction call. */
export const MAX_KIMI_IMAGES = 8;

/**
 * Flatten per-document image lists into one ordered list, capped to `maxTotal`.
 * Excess images are dropped (never silently — a warning is logged) so a large
 * multi-page upload cannot blow the request/token budget.
 */
export function capImages(
  perDoc: string[][],
  maxTotal = MAX_KIMI_IMAGES,
): string[] {
  const flat: string[] = [];
  for (const imgs of perDoc) {
    for (const img of imgs) {
      if (flat.length >= maxTotal) {
        console.warn(
          `Kimi image cap reached (${maxTotal}); dropping extra page images.`,
        );
        return flat;
      }
      flat.push(img);
    }
  }
  return flat;
}

/**
 * Resolve all documents to a capped, ordered list of Kimi-ready JPEG data URIs.
 * Each document contributes 1 image (image files) or up to MAX_PDF_PAGES images
 * (PDFs); the flattened total is capped by {@link capImages}.
 */
export async function toKimiImageDataUrisForDocuments(
  documentIds: string[],
): Promise<string[]> {
  const perDoc = await Promise.all(
    documentIds.map(async (docId) => {
      const file = await resolveExpenseDocumentFile(docId);
      const bytes = await file.read();
      return bytesToKimiJpegDataUris(bytes, file.mimeType);
    }),
  );
  return capImages(perDoc);
}
