import type { ApprovalStatus } from "../../types/expense.types";
import type {
  AiExtractionSnapshot,
  ExpenseAnalysisDocument,
} from "../../types/expenseAnalysis.types";
import type { ExtractionResult } from "./extraction";

/**
 * Whether an analysis record may still be edited by its owner. Mirrors the
 * expense-editability rule (DRAFT or REJECTED): once an expense is submitted,
 * under review, or approved, its analysis is FROZEN so the recorded extraction
 * and corrections can never change underneath HR/Admin. This is the audit-trail
 * integrity guarantee.
 */
export function isAnalysisEditable(status: ApprovalStatus): boolean {
  return status === "DRAFT" || status === "REJECTED";
}

/** Build the immutable AI snapshot from a fresh extraction result. */
export function snapshotFromExtraction(
  r: ExtractionResult,
): AiExtractionSnapshot {
  return {
    vendorName: r.vendorName,
    amount: r.amount,
    transactionDate: r.transactionDate,
    currency: r.currency,
    paymentMethod: r.paymentMethod,
    category: r.category,
    taxInformation: r.taxInformation,
    confidenceScore: r.confidenceScore,
    lowConfidenceReason: r.lowConfidenceReason,
  };
}

/** The employee-facing fields compared in the audit trail. */
export const AUDIT_FIELDS = [
  "vendorName",
  "amount",
  "transactionDate",
  "currency",
  "paymentMethod",
  "category",
  "taxInformation",
] as const;

export type AuditField = (typeof AUDIT_FIELDS)[number];

export interface FieldChange {
  field: AuditField;
  ai: string | number | null;
  corrected: string | number | null | undefined;
  changed: boolean;
}

/**
 * Compute the per-field diff between the immutable AI snapshot and the analysis
 * record's current (possibly employee-corrected) values. Used to show HR/Admin
 * exactly what the employee changed. A field is "changed" only when a corrected
 * value is present AND differs from what the AI extracted.
 */
export function diffCorrections(doc: {
  aiExtraction?: AiExtractionSnapshot;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
}): FieldChange[] {
  const ai = doc.aiExtraction;
  return AUDIT_FIELDS.map((field) => {
    const aiValue = (ai?.[field] ?? null) as string | number | null;
    const corrected = doc[field] as string | number | undefined;
    const changed =
      corrected !== undefined &&
      corrected !== null &&
      String(corrected) !== String(aiValue ?? "");
    return { field, ai: aiValue, corrected: corrected ?? null, changed };
  });
}

/** Convenience: did the employee change anything vs the AI extraction? */
export function hasCorrections(doc: Pick<
  ExpenseAnalysisDocument,
  "aiExtraction" | AuditField
>): boolean {
  return diffCorrections(doc).some((c) => c.changed);
}
