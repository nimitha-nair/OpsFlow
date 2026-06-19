/** Receipt upload constraints — mirror the backend allow-list and caps. */
export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface ValidationResult {
  accepted: File[];
  errors: string[];
}

/**
 * Validate a batch of incoming files against the MIME allow-list, the per-file
 * size cap, and the total-file cap (accounting for files already attached).
 * Returns the accepted subset plus human-readable error messages for the rest.
 */
export function validateFiles(
  incoming: File[],
  existingCount: number,
): ValidationResult {
  const accepted: File[] = [];
  const errors: string[] = [];
  let slots = MAX_FILES - existingCount;

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
      errors.push(`You can attach a maximum of ${MAX_FILES} files`);
      break;
    }
    accepted.push(f);
    slots -= 1;
  }
  return { accepted, errors };
}
