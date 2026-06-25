import { z } from "zod";

import { RISK_REASONS, type RiskReason } from "../../types/expenseAnalysis.types";

/** Token usage as reported by the provider (Kimi/NVIDIA), when available. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

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
  /**
   * 0–100: how likely this is a genuine, original receipt photo (not a
   * screenshot/edit). Optional only so older fixtures stay valid; production
   * extractors (parseModelJson, mock) always set it — consumers default to 100.
   */
  authenticityScore?: number;
  /** Detected authenticity-risk indicators (may be empty). */
  riskReasons?: RiskReason[];
  rawOutput: string; // verbatim model content
  /** Provider token usage when reported (Kimi); absent for the mock extractor. */
  usage?: TokenUsage | null;
}

export interface ExtractionInput {
  expenseId: string;
  /** Primary document (back-compat for single-document callers). */
  documentId: string;
  /** Full document set for multi-document analysis (preferred when present). */
  documentIds?: string[];
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
  authenticityScore: z
    .union([z.number(), z.null()])
    .optional()
    // Absent (legacy/lenient) → assume authentic so we never invent risk.
    .transform((v) => (v == null ? 100 : v)),
  riskReasons: z
    .array(z.string())
    .optional()
    .transform((v) =>
      (v ?? []).filter((r): r is RiskReason =>
        (RISK_REASONS as readonly string[]).includes(r),
      ),
    ),
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
    authenticityScore: Math.max(0, Math.min(100, Math.round(d.authenticityScore))),
    riskReasons: d.riskReasons,
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
