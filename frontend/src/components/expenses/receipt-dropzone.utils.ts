/** Receipt upload constraints — mirror the backend allow-list and caps. */
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Longest-edge cap (px) and JPEG quality for client-side image compression. */
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.82;
/** Images already under this size are uploaded as-is (no point recompressing). */
const COMPRESS_THRESHOLD = 1024 * 1024; // 1 MB

/** Decode a File into something drawable, preferring createImageBitmap. */
async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> decoder */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Downscale + re-encode a large photo to JPEG so big phone captures (often
 * 3–8 MB) fit under the upload cap and transfer quickly on mobile networks.
 * Non-images (PDFs) and already-small images pass through unchanged. Never
 * throws — returns the original file if anything goes wrong.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= COMPRESS_THRESHOLD) return file;
  try {
    const source = await loadImage(file);
    const dims = source as {
      width: number;
      height: number;
      naturalWidth?: number;
      naturalHeight?: number;
    };
    const sw = dims.naturalWidth || dims.width;
    const sh = dims.naturalHeight || dims.height;
    if (!sw || !sh) return file;
    const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
    if ("close" in source && typeof source.close === "function") source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    // Keep the original if compression didn't actually shrink it.
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export interface ValidationResult {
  accepted: File[];
  errors: string[];
}

/**
 * Validate a batch of incoming files against the MIME allow-list, the per-file
 * size cap, and the total-file cap (accounting for files already attached).
 * Returns the accepted subset plus human-readable error messages for the rest.
 *
 * @param maxFiles - overrides the default MAX_FILES cap; existing callers that
 *   omit this argument retain the current 5-file limit unchanged.
 */
export function validateFiles(
  incoming: File[],
  existingCount: number,
  maxFiles = MAX_FILES,
): ValidationResult {
  const accepted: File[] = [];
  const errors: string[] = [];
  let slots = maxFiles - existingCount;

  for (const f of incoming) {
    if (!ACCEPTED_MIME.includes(f.type)) {
      errors.push(`${f.name}: unsupported type`);
      continue;
    }
    if (f.size > MAX_BYTES) {
      errors.push(`${f.name}: too large (max 5 MB)`);
      continue;
    }
    if (slots <= 0) {
      errors.push(`You can attach a maximum of ${maxFiles} files`);
      break;
    }
    accepted.push(f);
    slots -= 1;
  }
  return { accepted, errors };
}
