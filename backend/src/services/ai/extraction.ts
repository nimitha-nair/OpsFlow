import { z } from "zod";

/** Canonical, provider-agnostic extractor output. */
export interface ExtractionResult {
  vendorName: string | null;
  amount: number | null;
  transactionDate: string | null; // YYYY-MM-DD
  currency: string | null;
  paymentMethod: string | null;
  category: string | null; // free text from the model
  taxInformation: string | null;
  /** Optional model-provided explanation of low confidence (null if none). */
  lowConfidenceReason: string | null;
  confidenceScore: number; // 0–100
  rawOutput: string; // verbatim model content
}

export interface ExtractionInput {
  expenseId: string;
  documentId: string;
}

/** Thrown when the model output cannot be parsed/validated into a result. */
export class MalformedExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExtractionError";
  }
}

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

const modelJsonSchema = z.object({
  vendorName: nullableString,
  amount: z
    .union([z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v)),
  transactionDate: nullableString,
  currency: nullableString,
  paymentMethod: nullableString,
  category: nullableString,
  taxInformation: nullableString,
  lowConfidenceReason: nullableString,
  confidenceScore: z
    .union([z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? 0 : v)),
});

/** Pull the first balanced JSON object out of a possibly-fenced string. */
function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new MalformedExtractionError("No JSON object found in model output");
  }
  return raw.slice(start, end + 1);
}

/** Parse + validate raw model text into an ExtractionResult. */
export function parseModelJson(raw: string): ExtractionResult {
  const slice = extractJsonObject(raw);
  let json: unknown;
  try {
    json = JSON.parse(slice);
  } catch {
    throw new MalformedExtractionError("Model output is not valid JSON");
  }
  const parsed = modelJsonSchema.safeParse(json);
  if (!parsed.success) {
    throw new MalformedExtractionError(
      `Model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  const d = parsed.data;
  const confidence = Math.max(0, Math.min(100, Math.round(d.confidenceScore)));
  return {
    vendorName: d.vendorName,
    amount: d.amount,
    transactionDate: d.transactionDate,
    currency: d.currency,
    paymentMethod: d.paymentMethod,
    category: d.category,
    taxInformation: d.taxInformation,
    lowConfidenceReason: d.lowConfidenceReason,
    confidenceScore: confidence,
    rawOutput: raw,
  };
}

/** Map a confidence score to a terminal success status. */
export function statusForConfidence(
  score: number,
  threshold: number,
): "COMPLETED" | "LOW_CONFIDENCE" {
  return score >= threshold ? "COMPLETED" : "LOW_CONFIDENCE";
}
