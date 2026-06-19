export const EXPENSE_TYPES = ["DOCUMENT", "CASH"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_SCOPES = ["PROJECT", "GENERAL"] as const;
export type ExpenseScope = (typeof EXPENSE_SCOPES)[number];

export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "FOOD",
  "SOFTWARE",
  "HARDWARE",
  "TRAINING",
  "CLOUD_SERVICES",
  "OFFICE_SUPPLIES",
  "MISCELLANEOUS",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const APPROVAL_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const REIMBURSEMENT_STATUSES = ["PENDING", "PROCESSING", "PAID"] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

export interface Expense {
  id: string;
  employeeId: string;
  scope: ExpenseScope;
  projectId?: string;
  type: ExpenseType;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  description: string;
  expenseDate: string;
  approvalStatus: ApprovalStatus;
  reimbursementStatus: ReimbursementStatus;
  documentId?: string;
  /** All attached documents (primary first). `documentId` mirrors documentIds[0]. */
  documentIds?: string[];
  /** How the expense was created — "AI" (receipt) or "MANUAL" (no receipt). */
  creationMethod?: "AI" | "MANUAL";
  /** Review outcome (present once approved/rejected). */
  reviewRemarks?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpensePayload {
  scope: ExpenseScope;
  projectId?: string;
  /** Defaults to DOCUMENT (AI path) on the server; CASH = manual fallback. */
  type?: ExpenseType;
  /** Optional on the AI path — filled by extraction/verification. */
  category?: ExpenseCategory;
  amount?: number;
  currency: string;
  description?: string;
  expenseDate?: string;
  isDraft?: boolean;
}

export type UpdateExpensePayload = Partial<
  Omit<CreateExpensePayload, "isDraft">
>;

export interface ExpensesListResponse {
  data: Expense[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ExpenseFileView {
  id: string;
  expenseId: string;
  /** Generated on-disk name. */
  fileName: string;
  /** Name the user uploaded (use this for display/download). */
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  /** API path (relative to the API base) that streams the file bytes. */
  url: string;
}

export interface ProjectSpending {
  projectId: string;
  projectName: string;
  budget: number;
  totalSpent: number;
  utilization: number;
  currency: string;
  expenses: Expense[];
}

/** Per-project spending summary for the admin overview. */
export interface ProjectSpendingSummary {
  projectId: string;
  projectName: string;
  status: string;
  budget: number;
  totalSpent: number;
  remaining: number;
  utilization: number;
  currency: string;
}

/** Latest review decision, read from the expenseApprovals audit log. */
export interface ReviewInfo {
  status: "APPROVED" | "REJECTED";
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
  remarks: string;
}

/** Status filter groups for HR/Admin lifecycle views. */
export type ExpenseStatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

/** Budget-utilization health band → drives color-coding. */
export type UtilizationState = "healthy" | "warning" | "critical";

export function utilizationState(pct: number): UtilizationState {
  if (pct >= 100) return "critical";
  if (pct >= 80) return "warning";
  return "healthy";
}

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: "Travel",
  FOOD: "Food",
  SOFTWARE: "Software",
  HARDWARE: "Hardware",
  TRAINING: "Training",
  CLOUD_SERVICES: "Cloud Services",
  OFFICE_SUPPLIES: "Office Supplies",
  MISCELLANEOUS: "Miscellaneous",
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_REVIEW: "Pending Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const SCOPE_LABELS: Record<ExpenseScope, string> = {
  PROJECT: "Project",
  GENERAL: "General",
};

export const REIMBURSEMENT_LABELS: Record<ReimbursementStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
};

export const TYPE_LABELS: Record<ExpenseType, string> = {
  DOCUMENT: "Document",
  CASH: "Cash",
};
