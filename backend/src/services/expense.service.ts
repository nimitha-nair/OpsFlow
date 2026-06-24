import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { generateCode } from "./code-generator";
import type {
  ApprovalStatus,
  Expense,
  ExpenseApprovalDocument,
  ExpenseCategory,
  ExpenseDocument,
  ExpenseScope,
  ExpenseType,
  ReimbursementStatus,
} from "../types/expense.types";
import type { ProjectStatus } from "../types/project.types";
import {
  assertProjectNotArchived,
  getProjectById,
  listProjects,
} from "./project.service";
import { isProjectMember } from "./projectMember.service";
import { getUserById } from "./user.service";
import { assertSubmittable } from "./expense.submit-gate";
import { isValidReimbursementTransition } from "./reimbursement";
import { filterByDateWindow } from "../utils/date-window";

const EXPENSES_COLLECTION = "expenses";
const APPROVALS_COLLECTION = "expenseApprovals";

const PENDING_STATUSES: ApprovalStatus[] = ["SUBMITTED", "PENDING_REVIEW"];

/** Status filter groups for HR/Admin lifecycle views. */
export type ExpenseStatusFilter = "PENDING" | "APPROVED" | "REJECTED" | "ALL";

export interface CreateExpenseInput {
  employeeId: string;
  scope: ExpenseScope;
  projectId?: string;
  /** Defaults to DOCUMENT (AI path); CASH signals the manual fallback. */
  type?: ExpenseType;
  /** Optional on the AI path — filled by extraction/verification. */
  category?: ExpenseCategory;
  amount?: number;
  currency: string;
  description?: string;
  expenseDate?: string;
  isDraft?: boolean;
}

export interface UpdateExpenseInput {
  scope?: ExpenseScope;
  projectId?: string;
  type?: ExpenseType;
  category?: ExpenseCategory;
  amount?: number;
  currency?: string;
  description?: string;
  expenseDate?: string;
}

export interface ListExpensesParams {
  page: number;
  limit: number;
  projectId?: string;
  category?: ExpenseCategory;
}

export interface PaginatedExpenses {
  data: Expense[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

function tsMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function toPublicExpense(expense: ExpenseDocument): Expense {
  const result: Expense = {
    id: expense.id,
    employeeId: expense.employeeId,
    scope: expense.scope ?? "PROJECT",
    type: expense.type,
    category: expense.category,
    amount: expense.amount,
    currency: expense.currency,
    description: expense.description,
    expenseDate: expense.expenseDate,
    approvalStatus: expense.approvalStatus,
    reimbursementStatus: expense.reimbursementStatus,
    createdAt: tsIso(expense.createdAt),
    updatedAt: tsIso(expense.updatedAt),
  };
  if (expense.code !== undefined) {
    result.code = expense.code;
  }
  if (expense.projectId !== undefined) {
    result.projectId = expense.projectId;
  }
  if (expense.documentId !== undefined) {
    result.documentId = expense.documentId;
  }
  if (expense.documentIds !== undefined) {
    result.documentIds = expense.documentIds;
  }
  if (expense.creationMethod !== undefined) {
    result.creationMethod = expense.creationMethod;
  }
  if (expense.reviewRemarks !== undefined) {
    result.reviewRemarks = expense.reviewRemarks;
  }
  if (expense.reviewedById !== undefined) {
    result.reviewedById = expense.reviewedById;
  }
  if (expense.reviewedByName !== undefined) {
    result.reviewedByName = expense.reviewedByName;
  }
  if (expense.reviewedAt !== undefined) {
    result.reviewedAt = tsIso(expense.reviewedAt);
  }
  if (expense.submittedAt !== undefined) {
    result.submittedAt = tsIso(expense.submittedAt);
  }
  return result;
}

async function getExpenseDocById(id: string): Promise<ExpenseDocument | null> {
  const snap = await db.collection(EXPENSES_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ExpenseDocument, "id">) };
}

/** Internal: raw expense or 404 (used for authorization checks). */
export async function requireExpense(id: string): Promise<ExpenseDocument> {
  const expense = await getExpenseDocById(id);
  if (!expense) {
    throw new ApiError(404, "Expense not found");
  }
  return expense;
}

export async function getExpenseById(id: string): Promise<Expense> {
  return toPublicExpense(await requireExpense(id));
}

async function getAllExpenseDocs(): Promise<ExpenseDocument[]> {
  const snapshot = await db
    .collection(EXPENSES_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ExpenseDocument, "id">),
  }));
}

/** For PROJECT scope: validate the project exists and the employee is a member. */
async function assertProjectAssignment(
  projectId: string,
  employeeId: string,
): Promise<void> {
  await getProjectById(projectId); // 404 if missing
  if (!(await isProjectMember(projectId, employeeId))) {
    throw new ApiError(
      403,
      "You can only submit expenses for projects you are assigned to",
    );
  }
}

/**
 * Create an expense. PROJECT-scoped expenses require a projectId the employee is
 * assigned to; GENERAL expenses have no project. `isDraft` saves it as a DRAFT.
 */
export async function createExpense(
  input: CreateExpenseInput,
): Promise<Expense> {
  const now = FieldValue.serverTimestamp();
  const type = input.type ?? "DOCUMENT";
  const data: Record<string, unknown> = {
    code: await generateCode("expense"),
    employeeId: input.employeeId,
    scope: input.scope,
    type,
    // AI-path defaults: amount/date/category are filled at verify/confirm. The
    // submit gate (assertSubmittable) blocks submission until they are real.
    category: input.category ?? "MISCELLANEOUS",
    amount: input.amount ?? 0,
    currency: input.currency,
    description: (input.description ?? "").trim(),
    expenseDate: input.expenseDate ?? new Date().toISOString().slice(0, 10),
    approvalStatus: (input.isDraft ? "DRAFT" : "SUBMITTED") as ApprovalStatus,
    reimbursementStatus: "PENDING",
    // Drives AI adoption analytics (forward-only): CASH = manual fallback path.
    creationMethod: type === "CASH" ? "MANUAL" : "AI",
    createdAt: now,
    updatedAt: now,
  };

  // Stamp submission time when created directly as submitted (AI-first / manual
  // non-draft path); drafts get submittedAt later, in submitExpense.
  if (!input.isDraft) {
    data.submittedAt = now;
  }

  // Project allocation is optional at creation (deferred to the verify step). When
  // a project IS supplied, validate it; the submit gate enforces presence later.
  if (input.scope === "PROJECT" && input.projectId) {
    await assertProjectNotArchived(input.projectId);
    await assertProjectAssignment(input.projectId, input.employeeId);
    data.projectId = input.projectId;
  }

  const ref = await db.collection(EXPENSES_COLLECTION).add(data);
  const created = await getExpenseDocById(ref.id);
  if (!created) {
    throw new ApiError(500, "Failed to load the created expense");
  }
  return toPublicExpense(created);
}

/** Edit an employee's own DRAFT expense. */
export async function updateExpense(
  id: string,
  employeeId: string,
  input: UpdateExpenseInput,
): Promise<Expense> {
  const expense = await requireExpense(id);
  if (expense.employeeId !== employeeId) {
    throw new ApiError(403, "You can only edit your own expenses");
  }
  // Drafts are editable; rejected expenses are editable so they can be corrected
  // and resubmitted. Submitted/under-review/approved expenses are locked.
  if (
    expense.approvalStatus !== "DRAFT" &&
    expense.approvalStatus !== "REJECTED"
  ) {
    throw new ApiError(400, "Only draft or rejected expenses can be edited");
  }

  const updates: Record<string, unknown> = {};
  const scope = input.scope ?? expense.scope ?? "PROJECT";
  const projectId = input.projectId ?? expense.projectId;

  if (scope === "PROJECT") {
    if (!projectId) {
      throw new ApiError(400, "projectId is required for PROJECT expenses");
    }
    await assertProjectAssignment(projectId, employeeId);
    updates.scope = "PROJECT";
    updates.projectId = projectId;
  } else {
    updates.scope = "GENERAL";
    updates.projectId = FieldValue.delete();
  }

  if (input.type !== undefined) updates.type = input.type;
  if (input.category !== undefined) updates.category = input.category;
  if (input.amount !== undefined) updates.amount = input.amount;
  if (input.currency !== undefined) updates.currency = input.currency;
  if (input.description !== undefined)
    updates.description = input.description.trim();
  if (input.expenseDate !== undefined) updates.expenseDate = input.expenseDate;

  updates.updatedAt = FieldValue.serverTimestamp();
  await db.collection(EXPENSES_COLLECTION).doc(id).update(updates);

  const updated = await getExpenseDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated expense");
  }
  return toPublicExpense(updated);
}

/**
 * Submit an employee's own expense for review.
 * - DRAFT      → SUBMITTED   (first submission)
 * - REJECTED   → PENDING_REVIEW (resubmission of a corrected expense)
 * The expenseApprovals audit log is preserved across resubmissions; the
 * denormalized review fields on the expense are cleared so the resubmitted
 * expense no longer displays the previous rejection.
 */
export async function submitExpense(
  id: string,
  employeeId: string,
): Promise<Expense> {
  const expense = await requireExpense(id);
  if (expense.employeeId !== employeeId) {
    throw new ApiError(403, "You can only submit your own expenses");
  }

  let nextStatus: ApprovalStatus;
  if (expense.approvalStatus === "DRAFT") {
    nextStatus = "SUBMITTED";
  } else if (expense.approvalStatus === "REJECTED") {
    nextStatus = "PENDING_REVIEW";
  } else {
    throw new ApiError(400, "Only draft or rejected expenses can be submitted");
  }

  // AI-first drafts may have been created without amount/date/category; require
  // them now (the verify/confirm step fills them in).
  assertSubmittable(expense);

  if (expense.scope === "PROJECT") {
    if (!expense.projectId) {
      throw new ApiError(400, "Select a project before submitting");
    }
    await assertProjectAssignment(expense.projectId, employeeId);
  }

  await db.collection(EXPENSES_COLLECTION).doc(id).update({
    approvalStatus: nextStatus,
    // First submission (DRAFT → SUBMITTED) stamps the submission time, which the
    // admin queues filter on. Resubmissions (REJECTED → PENDING_REVIEW) keep it.
    ...(nextStatus === "SUBMITTED"
      ? { submittedAt: FieldValue.serverTimestamp() }
      : {}),
    // Clear the prior review outcome from the expense (audit log is preserved).
    reviewRemarks: FieldValue.delete(),
    reviewedById: FieldValue.delete(),
    reviewedByName: FieldValue.delete(),
    reviewedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await getExpenseDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the submitted expense");
  }
  return toPublicExpense(updated);
}

/**
 * Delete an employee's own DRAFT expense. Returns the linked documentId (if any)
 * so the caller can remove the stored file/record. Only drafts are deletable.
 */
export async function deleteDraftExpense(
  id: string,
  employeeId: string,
): Promise<{ documentId?: string }> {
  const expense = await requireExpense(id);
  if (expense.employeeId !== employeeId) {
    throw new ApiError(403, "You can only delete your own expenses");
  }
  if (expense.approvalStatus !== "DRAFT") {
    throw new ApiError(400, "Only draft expenses can be deleted");
  }
  await db.collection(EXPENSES_COLLECTION).doc(id).delete();
  return expense.documentId !== undefined
    ? { documentId: expense.documentId }
    : {};
}

/** Set the linked document id on an expense (after a successful upload). */
export async function setExpenseDocumentId(
  expenseId: string,
  documentId: string,
): Promise<void> {
  await db.collection(EXPENSES_COLLECTION).doc(expenseId).update({
    documentId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Append a document to the expense's list; set it primary if none yet. */
export async function addExpenseDocumentId(
  expenseId: string,
  documentId: string,
): Promise<void> {
  const ref = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const snap = await ref.get();
  const data = snap.data() as ExpenseDocument | undefined;
  await ref.update({
    documentIds: FieldValue.arrayUnion(documentId),
    ...(data?.documentId ? {} : { documentId }),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Remove a document from the expense; re-point or clear the primary pointer. */
export async function removeExpenseDocumentId(
  expenseId: string,
  documentId: string,
): Promise<void> {
  const ref = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const snap = await ref.get();
  const data = snap.data() as ExpenseDocument | undefined;
  const remaining = (data?.documentIds ?? []).filter((d) => d !== documentId);
  const updates: Record<string, unknown> = {
    documentIds: FieldValue.arrayRemove(documentId),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data?.documentId === documentId) {
    updates.documentId = remaining[0] ?? FieldValue.delete();
  }
  await ref.update(updates);
}

/** Expenses submitted by an employee, newest first (includes drafts). */
export async function listMyExpenses(
  employeeId: string,
  from?: string,
  to?: string,
): Promise<Expense[]> {
  const snapshot = await db
    .collection(EXPENSES_COLLECTION)
    .where("employeeId", "==", employeeId)
    .get();
  const docs = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ExpenseDocument, "id">),
  }));
  docs.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  return filterByDateWindow(docs, (d) => d.expenseDate, from, to).map(
    toPublicExpense,
  );
}

/** Expenses awaiting review (HR). Drafts are excluded. */
export async function listPendingExpenses(
  from?: string,
  to?: string,
): Promise<Expense[]> {
  const all = await getAllExpenseDocs();
  const pending = all.filter((e) =>
    PENDING_STATUSES.includes(e.approvalStatus),
  );
  // Review QUEUE: window by submission date (createdAt), so "today" means
  // "submitted today" (the work that arrived), not when the expense was incurred.
  return filterByDateWindow(pending, (e) => e.createdAt, from, to).map(
    toPublicExpense,
  );
}

/**
 * Approved expenses for the reimbursements view, newest first, windowed by the
 * PAID date (`reimbursedAt`). Unbounded ⇒ all approved expenses; a bounded range
 * shows only reimbursements paid in that window (unpaid ones have no paid date).
 */
export async function listReimbursements(
  from?: string,
  to?: string,
): Promise<Expense[]> {
  const approved = (await getAllExpenseDocs()).filter(
    (e) => e.approvalStatus === "APPROVED",
  );
  approved.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  return filterByDateWindow(approved, (e) => e.reimbursedAt, from, to).map(
    toPublicExpense,
  );
}

/** Approved expenses (ADMIN), filterable + paginated. */
export async function listApprovedExpenses(
  params: ListExpensesParams,
): Promise<PaginatedExpenses> {
  let approved = (await getAllExpenseDocs()).filter(
    (e) => e.approvalStatus === "APPROVED",
  );
  if (params.projectId !== undefined) {
    approved = approved.filter((e) => e.projectId === params.projectId);
  }
  if (params.category !== undefined) {
    approved = approved.filter((e) => e.category === params.category);
  }

  const total = approved.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
  const start = (params.page - 1) * params.limit;
  const pageItems = approved.slice(start, start + params.limit);

  return {
    data: pageItems.map(toPublicExpense),
    pagination: { page: params.page, limit: params.limit, total, totalPages },
  };
}

/** Resolve a reviewer's display name; falls back gracefully. */
async function reviewerName(reviewerId: string): Promise<string> {
  try {
    return (await getUserById(reviewerId)).name;
  } catch {
    return "Reviewer";
  }
}

export interface ReviewInfo {
  status: "APPROVED" | "REJECTED";
  reviewerId: string;
  reviewerName: string;
  reviewedAt: string;
  remarks: string;
}

/**
 * The most recent review decision for an expense, read from the
 * `expenseApprovals` audit log (the source of truth — present even for
 * expenses reviewed before review info was denormalized onto the expense).
 * Returns null if the expense has never been reviewed.
 */
export async function getLatestReview(
  expenseId: string,
): Promise<ReviewInfo | null> {
  const snapshot = await db
    .collection(APPROVALS_COLLECTION)
    .where("expenseId", "==", expenseId)
    .get();
  if (snapshot.empty) return null;

  const docs = snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ExpenseApprovalDocument, "id">),
  }));
  docs.sort((a, b) => tsMillis(b.reviewedAt) - tsMillis(a.reviewedAt));
  const latest = docs[0];
  if (!latest) return null;

  return {
    status: latest.status,
    reviewerId: latest.reviewerId,
    reviewerName: await reviewerName(latest.reviewerId),
    reviewedAt: tsIso(latest.reviewedAt),
    remarks: latest.remarks ?? "",
  };
}

/** HR claims a submitted expense for review: SUBMITTED → PENDING_REVIEW. */
export async function startReview(
  id: string,
  _reviewerId: string,
): Promise<Expense> {
  const expense = await requireExpense(id);
  if (expense.approvalStatus === "PENDING_REVIEW") {
    return toPublicExpense(expense); // idempotent
  }
  if (expense.approvalStatus !== "SUBMITTED") {
    throw new ApiError(400, "Only submitted expenses can be moved to review");
  }
  await db.collection(EXPENSES_COLLECTION).doc(id).update({
    approvalStatus: "PENDING_REVIEW" as ApprovalStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await getExpenseDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the expense");
  }
  return toPublicExpense(updated);
}

/**
 * Non-draft expenses for HR/Admin lifecycle views, newest first, filtered by
 * status group. Drafts are private to their owner and never returned here.
 */
export async function listExpensesByStatus(
  filter: ExpenseStatusFilter,
  from?: string,
  to?: string,
  dateField: "expenseDate" | "submittedAt" = "expenseDate",
): Promise<Expense[]> {
  const all = (await getAllExpenseDocs()).filter(
    (e) => e.approvalStatus !== "DRAFT",
  );
  const byStatus =
    filter === "ALL"
      ? all
      : filter === "PENDING"
        ? all.filter((e) => PENDING_STATUSES.includes(e.approvalStatus))
        : all.filter((e) => e.approvalStatus === filter);
  // Apply the optional inclusive date window over the chosen field in memory:
  // submittedAt for admin queues, expenseDate for financial views.
  const filtered = filterByDateWindow(byStatus, (e) => e[dateField], from, to);
  return filtered.map(toPublicExpense);
}

async function reviewExpense(
  id: string,
  reviewerId: string,
  status: "APPROVED" | "REJECTED",
  remarks: string,
): Promise<Expense> {
  const expense = await requireExpense(id);
  if (!PENDING_STATUSES.includes(expense.approvalStatus)) {
    throw new ApiError(400, "This expense is not awaiting review");
  }

  const now = FieldValue.serverTimestamp();
  const reviewedByName = await reviewerName(reviewerId);
  // Denormalize the outcome onto the expense so employees/admins can see why,
  // without needing access to the user directory or the approvals audit log.
  await db.collection(EXPENSES_COLLECTION).doc(id).update({
    approvalStatus: status,
    reviewRemarks: remarks,
    reviewedById: reviewerId,
    reviewedByName,
    reviewedAt: now,
    updatedAt: now,
  });
  // Audit trail (immutable history of every review action).
  await db.collection(APPROVALS_COLLECTION).add({
    expenseId: id,
    reviewerId,
    status,
    remarks,
    reviewedAt: now,
  });

  const updated = await getExpenseDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the reviewed expense");
  }
  return toPublicExpense(updated);
}

export async function approveExpense(
  id: string,
  reviewerId: string,
  remarks: string,
): Promise<Expense> {
  return reviewExpense(id, reviewerId, "APPROVED", remarks);
}

export async function rejectExpense(
  id: string,
  reviewerId: string,
  remarks: string,
): Promise<Expense> {
  return reviewExpense(id, reviewerId, "REJECTED", remarks);
}

/** ADMIN: set the reimbursement status. Only for APPROVED expenses. */
export async function setReimbursementStatus(
  id: string,
  status: ReimbursementStatus,
): Promise<Expense> {
  const expense = await requireExpense(id);
  if (expense.approvalStatus !== "APPROVED") {
    throw new ApiError(
      400,
      "Reimbursement status can only be changed for approved expenses",
    );
  }
  // Forward-only lifecycle: PENDING → PROCESSING → PAID. Reject backward moves and
  // no-ops; once PAID the status is locked (a reversal must be a separate action).
  if (!isValidReimbursementTransition(expense.reimbursementStatus, status)) {
    throw new ApiError(
      400,
      `Reimbursement cannot move from ${expense.reimbursementStatus} to ${status}. ` +
        "Only forward transitions are allowed (PENDING → PROCESSING → PAID).",
    );
  }
  const update: Record<string, unknown> = {
    reimbursementStatus: status,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Stamp the payment date when it's marked PAID — this is what the
  // reimbursements date filter windows on (not the original expenseDate).
  if (status === "PAID") {
    update.reimbursedAt = FieldValue.serverTimestamp();
  }
  await db.collection(EXPENSES_COLLECTION).doc(id).update(update);
  const updated = await getExpenseDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated expense");
  }
  return toPublicExpense(updated);
}

/**
 * Approved expenses for a project plus computed spending/utilization.
 * Only PROJECT-scoped, APPROVED expenses contribute — the expenses collection
 * remains the single source of truth.
 */
export async function getProjectSpending(
  projectId: string,
): Promise<ProjectSpending> {
  const project = await getProjectById(projectId); // 404 if missing

  const snapshot = await db
    .collection(EXPENSES_COLLECTION)
    .where("projectId", "==", projectId)
    .get();
  const docs = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<ExpenseDocument, "id">),
    }))
    .filter((e) => e.approvalStatus === "APPROVED")
    .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));

  const totalSpent = docs.reduce((sum, e) => sum + e.amount, 0);
  const utilization =
    project.budget > 0 ? (totalSpent / project.budget) * 100 : 0;

  return {
    projectId: project.id,
    projectName: project.name,
    budget: project.budget,
    totalSpent,
    utilization,
    currency: docs[0]?.currency ?? "INR",
    expenses: docs.map(toPublicExpense),
  };
}

export interface ProjectSpendingSummary {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  budget: number;
  totalSpent: number;
  remaining: number;
  utilization: number;
  currency: string;
}

/**
 * Spending summary across ALL projects (ADMIN overview). Only PROJECT-scoped,
 * APPROVED expenses contribute to spend — budget calculations stay approved-only.
 */
export async function listProjectsSpending(): Promise<ProjectSpendingSummary[]> {
  const projects = (await listProjects({ page: 1, limit: 100000 })).data;
  const approved = (await getAllExpenseDocs()).filter(
    (e) => e.approvalStatus === "APPROVED" && e.projectId,
  );

  const spentByProject = new Map<string, number>();
  let currency = "INR";
  for (const e of approved) {
    const pid = e.projectId as string;
    spentByProject.set(pid, (spentByProject.get(pid) ?? 0) + e.amount);
    currency = e.currency ?? currency;
  }

  return projects.map((p) => {
    const totalSpent = spentByProject.get(p.id) ?? 0;
    const utilization = p.budget > 0 ? (totalSpent / p.budget) * 100 : 0;
    return {
      projectId: p.id,
      projectName: p.name,
      status: p.status,
      budget: p.budget,
      totalSpent,
      remaining: p.budget - totalSpent,
      utilization,
      currency,
    };
  });
}
