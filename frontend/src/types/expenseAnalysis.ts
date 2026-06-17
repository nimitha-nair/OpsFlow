import type { ExpenseCategory } from "./expense";

export type AnalysisStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "LOW_CONFIDENCE";

export interface ExpenseAnalysis {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  provider?: "mock" | "kimi";
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  lowConfidenceReason?: string;
  confidenceScore?: number;
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAnalysisPayload {
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confirm?: boolean;
}

type Tone = "slate" | "blue" | "emerald" | "amber" | "red";

export const ANALYSIS_STATUS_META: Record<
  AnalysisStatus,
  { label: string; tone: Tone; spinner: boolean }
> = {
  PENDING: { label: "Queued for analysis", tone: "slate", spinner: true },
  PROCESSING: { label: "Reading your receipt…", tone: "blue", spinner: true },
  COMPLETED: { label: "Analysis complete", tone: "emerald", spinner: false },
  LOW_CONFIDENCE: { label: "Low confidence — please verify", tone: "amber", spinner: false },
  FAILED: { label: "Analysis failed", tone: "red", spinner: false },
};

export function isTerminalStatus(s: AnalysisStatus): boolean {
  return s === "COMPLETED" || s === "LOW_CONFIDENCE" || s === "FAILED";
}

/**
 * Confidence buckets for prominent color coding (product spec):
 * 0–59 red (Low), 60–79 amber (Medium), 80–100 green (High).
 */
export function confidenceLevel(
  score: number | undefined,
): { label: string; tone: "emerald" | "amber" | "red" } {
  const s = score ?? 0;
  if (s >= 80) return { label: "High", tone: "emerald" };
  if (s >= 60) return { label: "Medium", tone: "amber" };
  return { label: "Low", tone: "red" };
}

/** The key fields users most need; used to explain a low-confidence result. */
const KEY_FIELDS: ReadonlyArray<{ key: keyof ExpenseAnalysis; label: string }> = [
  { key: "vendorName", label: "vendor" },
  { key: "amount", label: "amount" },
  { key: "transactionDate", label: "date" },
  { key: "currency", label: "currency" },
  { key: "category", label: "category" },
];

/**
 * Explain why a result is low confidence: prefer the model's own reason, else
 * derive one from which key fields came back empty, else a generic message.
 */
export function deriveLowConfidenceReason(a: Partial<ExpenseAnalysis>): string {
  if (a.lowConfidenceReason && a.lowConfidenceReason.trim().length > 0) {
    return a.lowConfidenceReason;
  }
  const missing = KEY_FIELDS.filter((f) => {
    const v = a[f.key];
    return v === undefined || v === null || v === "";
  }).map((f) => f.label);
  if (missing.length > 0) {
    const list =
      missing.length === 1
        ? missing[0]
        : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
    return `The ${list} could not be read clearly from the receipt.`;
  }
  return "Some values may be inaccurate — please review each field.";
}

const CATEGORY_VALUES: ExpenseCategory[] = [
  "TRAVEL", "FOOD", "SOFTWARE", "HARDWARE", "TRAINING",
  "CLOUD_SERVICES", "OFFICE_SUPPLIES", "MISCELLANEOUS",
];
const SYNONYMS: ReadonlyArray<[string, ExpenseCategory]> = [
  ["cloud", "CLOUD_SERVICES"], ["aws", "CLOUD_SERVICES"], ["azure", "CLOUD_SERVICES"],
  ["software", "SOFTWARE"], ["subscription", "SOFTWARE"], ["saas", "SOFTWARE"],
  ["hardware", "HARDWARE"], ["laptop", "HARDWARE"], ["device", "HARDWARE"],
  ["travel", "TRAVEL"], ["taxi", "TRAVEL"], ["uber", "TRAVEL"], ["flight", "TRAVEL"], ["hotel", "TRAVEL"],
  ["food", "FOOD"], ["meal", "FOOD"], ["restaurant", "FOOD"],
  ["training", "TRAINING"], ["course", "TRAINING"],
  ["office", "OFFICE_SUPPLIES"], ["stationery", "OFFICE_SUPPLIES"], ["supplies", "OFFICE_SUPPLIES"],
];

/** Map AI free-text category to a valid ExpenseCategory for prefill, or undefined. */
export function mapToExpenseCategory(
  raw: string | null | undefined,
): ExpenseCategory | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((CATEGORY_VALUES as string[]).includes(norm)) return norm as ExpenseCategory;
  const lower = raw.toLowerCase();
  for (const [needle, cat] of SYNONYMS) if (lower.includes(needle)) return cat;
  return undefined;
}
