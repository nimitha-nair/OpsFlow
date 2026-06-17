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
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
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
