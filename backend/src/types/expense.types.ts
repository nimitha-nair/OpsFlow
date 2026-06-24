import type { Timestamp } from "firebase-admin/firestore";

export const EXPENSE_TYPES = ["DOCUMENT", "CASH"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

/** Whether an expense is tied to a project or a general/organizational expense. */
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

/** Internal expense document as stored in Firestore. */
export interface ExpenseDocument {
  id: string;
  /** Human-readable code (EXP-0001). Optional until backfilled. */
  code?: string;
  employeeId: string;
  scope: ExpenseScope;
  /** Required when scope is PROJECT; absent for GENERAL expenses. */
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
  /** How the expense was created — drives AI adoption analytics (forward-only). */
  creationMethod?: "AI" | "MANUAL";
  /** Review outcome, denormalized for display after approve/reject. */
  reviewRemarks?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  /** When the reimbursement was marked PAID — drives the reimbursements date filter. */
  reimbursedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing expense; timestamps serialized as ISO-8601 strings. */
export interface Expense {
  id: string;
  code?: string;
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
  /** How the expense was created — drives AI adoption analytics (forward-only). */
  creationMethod?: "AI" | "MANUAL";
  reviewRemarks?: string;
  reviewedById?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Metadata for an uploaded receipt/invoice, stored in `expenseDocuments`.
 * The file itself lives on local disk under backend/uploads/expenses; `filePath`
 * is its location relative to the backend root.
 */
export interface ExpenseFileDocument {
  id: string;
  expenseId: string;
  /** Generated, unique on-disk name, e.g. expense_<ts>_<rand>.pdf */
  fileName: string;
  /** The name the user uploaded, preserved for display/download. */
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  /** Path relative to the backend root, e.g. uploads/expenses/expense_...pdf */
  filePath: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

/** Client-facing document metadata; timestamp serialized as ISO-8601. */
export interface ExpenseFileView {
  id: string;
  expenseId: string;
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  /** API path (relative to the API base) that streams the file bytes. */
  url: string;
}

/** Approval/rejection audit record. */
export interface ExpenseApprovalDocument {
  id: string;
  expenseId: string;
  reviewerId: string;
  status: "APPROVED" | "REJECTED";
  remarks: string;
  reviewedAt: Timestamp;
}
