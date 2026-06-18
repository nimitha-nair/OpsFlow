import type { Timestamp } from "firebase-admin/firestore";

export const ANALYSIS_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "LOW_CONFIDENCE",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/**
 * Immutable snapshot of exactly what the model extracted, captured once when the
 * analysis reaches a terminal success state. The top-level editable fields may be
 * overwritten by employee corrections, but this snapshot is never mutated — it is
 * the audit source for the "Receipt vs AI vs Employee corrections vs Final"
 * comparison shown to HR/Admin. `null` means the model could not read that field.
 */
export interface AiExtractionSnapshot {
  vendorName: string | null;
  amount: number | null;
  transactionDate: string | null; // YYYY-MM-DD
  currency: string | null;
  paymentMethod: string | null;
  category: string | null;
  taxInformation: string | null;
  confidenceScore: number; // 0–100
  lowConfidenceReason: string | null;
}

/** Internal analysis record as stored in Firestore (`expenseAnalysis`). */
export interface ExpenseAnalysisDocument {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  /** Which extractor produced this result — used to flag synthetic mock data. */
  provider?: "mock" | "kimi";
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string; // YYYY-MM-DD
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  /** Why the model reported low confidence, when it provided a reason. */
  lowConfidenceReason?: string;
  confidenceScore?: number; // 0–100
  /** Immutable original AI extraction — preserved verbatim for the audit trail. */
  aiExtraction?: AiExtractionSnapshot;
  /** Verbatim model output, e.g. { rawOutput } — preserved for audit. */
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing analysis; timestamps serialized as ISO-8601 strings. */
export interface ExpenseAnalysis {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  /** Which extractor produced this result — used to flag synthetic mock data. */
  provider?: "mock" | "kimi";
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  /** Why the model reported low confidence, when it provided a reason. */
  lowConfidenceReason?: string;
  confidenceScore?: number;
  /** Immutable original AI extraction — preserved verbatim for the audit trail. */
  aiExtraction?: AiExtractionSnapshot;
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}
