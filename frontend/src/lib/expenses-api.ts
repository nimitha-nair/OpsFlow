import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type {
  CreateExpensePayload,
  Expense,
  ExpenseCategory,
  ExpenseFileView,
  ExpensesListResponse,
  ExpenseStatusFilter,
  ProjectSpending,
  ProjectSpendingSummary,
  ReimbursementStatus,
  ReviewInfo,
  UpdateExpensePayload,
} from "../types/expense";

/** POST /expenses (EMPLOYEE) */
export async function createExpense(
  payload: CreateExpensePayload,
): Promise<Expense> {
  const { data } = await api.post<Expense>("/expenses", payload);
  return data;
}

/** PATCH /expenses/:id (EMPLOYEE — edit own DRAFT) */
export async function updateExpense(
  id: string,
  payload: UpdateExpensePayload,
): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}`, payload);
  return data;
}

/** POST /expenses/:id/submit (EMPLOYEE — submit a DRAFT or resubmit a REJECTED) */
export async function submitExpense(id: string): Promise<Expense> {
  const { data } = await api.post<Expense>(`/expenses/${id}/submit`, {});
  return data;
}

/** DELETE /expenses/:id (EMPLOYEE — delete own DRAFT) */
export async function deleteExpense(id: string): Promise<void> {
  await api.delete(`/expenses/${id}`);
}

/** GET /expenses/my-expenses (EMPLOYEE) */
export async function listMyExpenses(
  params: { from?: string; to?: string } = {},
): Promise<Expense[]> {
  const { data } = await api.get<{ data: Expense[] }>("/expenses/my-expenses", { params });
  return data.data;
}

/** GET /expenses/pending (HR) */
export async function listPendingExpenses(
  params: { from?: string; to?: string } = {},
): Promise<Expense[]> {
  const { data } = await api.get<{ data: Expense[] }>("/expenses/pending", { params });
  return data.data;
}

/** GET /expenses/review?status= (HR/ADMIN) — lifecycle list by status group. */
export async function listReviewExpenses(
  status: ExpenseStatusFilter = "ALL",
  params: { from?: string; to?: string; basis?: "expenseDate" | "submittedAt" } = {},
): Promise<Expense[]> {
  const { data } = await api.get<{ data: Expense[] }>("/expenses/review", {
    params: { status, ...params },
  });
  return data.data;
}

/** GET /expenses/reimbursements (HR/ADMIN) — approved expenses windowed by the
 *  date they were marked PAID, so a date range means "paid in this range." */
export async function listReimbursements(
  params: { from?: string; to?: string } = {},
): Promise<Expense[]> {
  const { data } = await api.get<{ data: Expense[] }>(
    "/expenses/reimbursements",
    { params },
  );
  return data.data;
}

/** PATCH /expenses/:id/review (HR) — SUBMITTED → PENDING_REVIEW. */
export async function startExpenseReview(id: string): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}/review`, {});
  return data;
}

/** GET /expenses/projects-spending (ADMIN) — spending across all projects. */
export async function listProjectsSpending(): Promise<ProjectSpendingSummary[]> {
  const { data } = await api.get<{ data: ProjectSpendingSummary[] }>(
    "/expenses/projects-spending",
  );
  return data.data;
}

/** GET /expenses (ADMIN) — approved, filterable. */
export async function listExpenses(params: {
  projectId?: string;
  category?: ExpenseCategory;
  limit?: number;
} = {}): Promise<Expense[]> {
  const { data } = await api.get<ExpensesListResponse>("/expenses", { params });
  return data.data;
}

/** GET /expenses/:id */
export async function getExpense(id: string): Promise<Expense> {
  const { data } = await api.get<Expense>(`/expenses/${id}`);
  return data;
}

/** GET /expenses/:id/review-info — latest review decision (or null if none). */
export async function getExpenseReviewInfo(
  id: string,
): Promise<ReviewInfo | null> {
  const { data } = await api.get<ReviewInfo | null>(
    `/expenses/${id}/review-info`,
  );
  return data;
}

/** GET /expenses/project/:projectId (ADMIN) */
export async function getProjectSpending(
  projectId: string,
): Promise<ProjectSpending> {
  const { data } = await api.get<ProjectSpending>(
    `/expenses/project/${projectId}`,
  );
  return data;
}

/** PATCH /expenses/:id/approve (HR) */
export async function approveExpense(
  id: string,
  remarks: string,
): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}/approve`, {
    remarks,
  });
  return data;
}

/** PATCH /expenses/:id/reject (HR) */
export async function rejectExpense(
  id: string,
  remarks: string,
): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}/reject`, {
    remarks,
  });
  return data;
}

/** PATCH /expenses/:id/reimbursement (ADMIN) */
export async function updateReimbursementStatus(
  id: string,
  reimbursementStatus: ReimbursementStatus,
): Promise<Expense> {
  const { data } = await api.patch<Expense>(`/expenses/${id}/reimbursement`, {
    reimbursementStatus,
  });
  return data;
}

/** POST /expenses/:id/documents (EMPLOYEE) — multipart upload. */
export async function uploadExpenseDocument(
  id: string,
  file: File,
): Promise<ExpenseFileView> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ExpenseFileView>(
    `/expenses/${id}/documents`,
    form,
  );
  return data;
}

/** GET /expenses/:id/document — document metadata (or 404 if none attached). */
export async function getExpenseDocument(
  id: string,
): Promise<ExpenseFileView> {
  const { data } = await api.get<ExpenseFileView>(`/expenses/${id}/document`);
  return data;
}

/** POST /expenses/:id/documents — multipart upload of one or many files. */
export async function uploadExpenseDocuments(
  id: string,
  files: File[],
): Promise<ExpenseFileView[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<ExpenseFileView[]>(
    `/expenses/${id}/documents`,
    form,
  );
  return data;
}

/** GET /expenses/:id/documents — all attached documents. */
export async function listExpenseDocuments(
  id: string,
): Promise<ExpenseFileView[]> {
  const { data } = await api.get<{ data: ExpenseFileView[] }>(
    `/expenses/${id}/documents`,
  );
  return data.data;
}

/** DELETE /expenses/:id/documents/:docId — remove one document. */
export async function deleteExpenseDocumentById(
  id: string,
  docId: string,
): Promise<void> {
  await api.delete(`/expenses/${id}/documents/${docId}`);
}

/**
 * Fetch a specific document's bytes (authenticated) and return a temporary object
 * URL. The caller must revoke it with URL.revokeObjectURL.
 */
export async function fetchExpenseDocByIdObjectUrl(
  id: string,
  docId: string,
  download = false,
): Promise<string> {
  const { data } = await api.get<Blob>(`/expenses/${id}/documents/${docId}/file`, {
    params: download ? { download: 1 } : undefined,
    responseType: "blob",
  });
  return URL.createObjectURL(data);
}

/**
 * Fetch the document bytes (authenticated) and return a temporary object URL.
 * The caller is responsible for revoking it with URL.revokeObjectURL.
 * `download` requests an attachment disposition from the server.
 */
export async function fetchExpenseDocumentObjectUrl(
  id: string,
  download = false,
): Promise<string> {
  const { data } = await api.get<Blob>(`/expenses/${id}/document/file`, {
    params: download ? { download: 1 } : undefined,
    responseType: "blob",
  });
  return URL.createObjectURL(data);
}

/** Open the document inline in a new browser tab. */
export async function viewExpenseDocument(id: string): Promise<void> {
  const objectUrl = await fetchExpenseDocumentObjectUrl(id, false);
  window.open(objectUrl, "_blank", "noopener");
  // Revoke after a delay so the new tab has time to load the blob.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/** Trigger a download of the document, preserving its original filename. */
export async function downloadExpenseDocument(
  id: string,
  fileName: string,
): Promise<void> {
  const objectUrl = await fetchExpenseDocumentObjectUrl(id, true);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export { apiErrorMessage };
