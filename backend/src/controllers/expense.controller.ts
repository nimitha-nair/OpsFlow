import { unlink } from "node:fs/promises";

import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import { paginate } from "../utils/paginate";
import UserRole from "../types/roles";
import type { JwtPayload } from "../types/auth.types";
import type {
  Expense,
  ExpenseDocument,
  ExpenseFileView,
  ReimbursementStatus,
} from "../types/expense.types";
import {
  addExpenseDocumentId,
  approveExpense,
  createExpense,
  deleteDraftExpense,
  getExpenseById,
  getLatestReview,
  listApprovedExpenses,
  listExpensesByStatus,
  listMyExpenses,
  listPendingExpenses,
  listReimbursements,
  listProjectsSpending,
  getProjectSpending,
  rejectExpense,
  removeExpenseDocumentId,
  requireExpense,
  setReimbursementStatus,
  startReview,
  submitExpense,
  updateExpense,
} from "../services/expense.service";
import {
  deleteExpenseDocument,
  getDocumentById,
  getExpenseDocumentMeta,
  listExpenseDocuments,
  resolveExpenseDocumentFile,
  saveExpenseDocument,
} from "../services/expense-document.service";
import {
  deleteAnalysisForExpense,
  riskLevelsForExpenses,
} from "../services/expenseAnalysis.service";
import { MAX_DOCS } from "../middleware/upload";
import { deriveDocumentIds } from "../services/expense-documents.read";
import { notify } from "../services/notification.service";
import { getStaffIds } from "../services/ticket.service";
import type {
  CreateExpenseInput,
  ExpenseStatusFilter,
  ListExpensesParams,
  UpdateExpenseInput,
} from "../services/expense.service";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected expense-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Human-readable reference for an expense in notifications (code, else id). */
function expenseRef(expense: { code?: string; id: string }): string {
  return `Expense ${expense.code ?? expense.id}`;
}

/** Case-insensitive match across the user-visible text fields of an expense. */
function matchesQuery(e: Expense, q?: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [e.code, e.description, e.category, e.currency, String(e.amount ?? "")]
    .some((v) => (v ?? "").toString().toLowerCase().includes(needle));
}

/** Whether a user may view a given expense. */
function canView(expense: ExpenseDocument, user: JwtPayload): boolean {
  // HR and ADMIN see everything except employees' private drafts. ADMIN needs
  // this to audit the full lifecycle (e.g. rejection decisions), not just
  // approved expenses.
  if (user.role === UserRole.HR) return expense.approvalStatus !== "DRAFT";
  if (user.role === UserRole.ADMIN) return expense.approvalStatus !== "DRAFT";
  // EMPLOYEE — only their own (including drafts).
  return expense.employeeId === user.userId;
}

/** POST /expenses — EMPLOYEE submits an expense. */
export async function postExpense(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const body = req.valid?.body as Omit<CreateExpenseInput, "employeeId">;
    const expense = await createExpense({
      ...body,
      employeeId: req.user.userId,
    });
    return res.status(201).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id — EMPLOYEE edits their own DRAFT. */
export async function patchExpense(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const input = req.valid?.body as UpdateExpenseInput;
    const expense = await updateExpense(id, req.user.userId, input);
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /expenses/:id/submit — EMPLOYEE submits their own DRAFT for review. */
export async function postSubmitExpense(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await submitExpense(id, req.user.userId);
    // Best-effort: alert the reviewers (HR + Admin) of the new submission.
    const reviewers = await getStaffIds();
    await notify(
      reviewers,
      {
        type: "EXPENSE_SUBMITTED",
        title: "New expense submitted",
        body: `${expenseRef(expense)} is awaiting review.`,
      },
      req.user.userId,
    );
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** DELETE /expenses/:id — EMPLOYEE deletes their own DRAFT (and its file). */
export async function deleteExpense(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const { documentId } = await deleteDraftExpense(id, req.user.userId);
    // Remove the linked draft document file + record (no orphans).
    if (documentId) {
      await deleteExpenseDocument(documentId);
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/my-expenses — EMPLOYEE's own expenses. */
export async function getMyExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { from, to, basis, page, limit, q } = (req.valid?.query ?? {}) as {
      from?: string;
      to?: string;
      basis?: "expenseDate" | "submittedAt";
      page: number;
      limit: number;
      q?: string;
    };
    const data = await listMyExpenses(
      req.user.userId,
      from,
      to,
      basis ?? "expenseDate",
    );
    const filtered = data.filter((e) => matchesQuery(e, q));
    return res.status(200).json(paginate(filtered, page, limit));
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/pending — HR review queue. */
export async function getPendingExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { from, to, page, limit, q } = (req.valid?.query ?? {}) as {
      from?: string;
      to?: string;
      page: number;
      limit: number;
      q?: string;
    };
    const data = await listPendingExpenses(from, to);
    return res.status(200).json(paginate(data.filter((e) => matchesQuery(e, q)), page, limit));
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/reimbursements — HR & ADMIN. Approved expenses windowed by
 *  the date they were marked PAID (reimbursedAt), so the date filter means
 *  "reimbursements paid in this range." */
export async function getReimbursements(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { from, to, page, limit, q } = (req.valid?.query ?? {}) as {
      from?: string;
      to?: string;
      page: number;
      limit: number;
      q?: string;
    };
    const data = await listReimbursements(from, to);
    return res.status(200).json(paginate(data.filter((e) => matchesQuery(e, q)), page, limit));
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/review?status=PENDING|APPROVED|REJECTED|ALL — HR & ADMIN. */
export async function getReviewExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { status, from, to, basis, page, limit, q } = (req.valid?.query ?? {}) as {
      status?: ExpenseStatusFilter;
      from?: string;
      to?: string;
      basis?: "expenseDate" | "submittedAt";
      page: number;
      limit: number;
      q?: string;
    };
    const data = await listExpensesByStatus(
      status ?? "ALL",
      from,
      to,
      basis ?? "expenseDate",
    );
    // Filter first, then paginate, then attach risk only on the page slice (cheaper).
    const filtered = data.filter((e) => matchesQuery(e, q));
    const pageResult = paginate(filtered, page, limit);
    const risks = await riskLevelsForExpenses(pageResult.data.map((e) => e.id));
    const withRisk = pageResult.data.map((e) => {
      const riskLevel = risks.get(e.id);
      return riskLevel ? { ...e, riskLevel } : e;
    });
    return res.status(200).json({ data: withRisk, pagination: pageResult.pagination });
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/review — HR moves SUBMITTED → PENDING_REVIEW. */
export async function patchStartReview(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await startReview(id, req.user.userId);
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/projects-spending — ADMIN: spending across all projects. */
export async function getProjectsSpending(
  _req: Request,
  res: Response,
): Promise<Response> {
  try {
    const data = await listProjectsSpending();
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses — ADMIN: approved expenses. */
export async function getExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const params = req.valid?.query as ListExpensesParams;
    const result = await listApprovedExpenses(params);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/project/:projectId — ADMIN: project spending. */
export async function getProjectExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId } = req.valid?.params as { projectId: string };
    const spending = await getProjectSpending(projectId);
    return res.status(200).json(spending);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/:id — owner / HR / ADMIN (approved only). */
export async function getExpense(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      return res
        .status(403)
        .json({ error: "You do not have access to this expense" });
    }
    return res.status(200).json(await getExpenseById(id));
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /expenses/:id/review-info — owner / HR / ADMIN: the latest review decision
 * (status, reviewer, date, remarks) read from the expenseApprovals audit log.
 * Returns null if the expense has never been reviewed.
 */
export async function getReviewInfo(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      return res
        .status(403)
        .json({ error: "You do not have access to this expense" });
    }
    const info = await getLatestReview(id);
    return res.status(200).json(info);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/approve — HR. */
export async function patchApprove(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const { remarks } = req.valid?.body as { remarks: string };
    const expense = await approveExpense(id, req.user.userId, remarks);
    // Best-effort: let the submitter know their expense was approved.
    await notify(
      [expense.employeeId],
      {
        type: "EXPENSE_APPROVED",
        title: "Expense approved",
        body: `${expenseRef(expense)} was approved.`,
      },
      req.user.userId,
    );
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/reject — HR. */
export async function patchReject(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const { remarks } = req.valid?.body as { remarks: string };
    const expense = await rejectExpense(id, req.user.userId, remarks);
    // Best-effort: tell the submitter, including the reviewer's remark when given.
    await notify(
      [expense.employeeId],
      {
        type: "EXPENSE_REJECTED",
        title: "Expense rejected",
        body: remarks
          ? `${expenseRef(expense)} was rejected: ${remarks}`
          : `${expenseRef(expense)} was rejected.`,
      },
      req.user.userId,
    );
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/reimbursement — ADMIN sets reimbursement status. */
export async function patchReimbursement(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const { reimbursementStatus } = req.valid?.body as {
      reimbursementStatus: ReimbursementStatus;
    };
    const expense = await setReimbursementStatus(id, reimbursementStatus);
    // Best-effort: notify the submitter once their reimbursement is paid.
    if (expense.reimbursementStatus === "PAID") {
      await notify(
        [expense.employeeId],
        {
          type: "EXPENSE_PAID",
          title: "Reimbursement paid",
          body: `${expenseRef(expense)} has been reimbursed.`,
        },
        req.user?.userId,
      );
    }
    return res.status(200).json(expense);
  } catch (err) {
    return handleError(res, err);
  }
}

/** Best-effort removal of a just-uploaded temp file when the request is rejected. */
async function discardUpload(file?: Express.Multer.File): Promise<void> {
  if (!file?.path) return;
  try {
    await unlink(file.path);
  } catch {
    // Already gone — ignore.
  }
}

/**
 * POST /expenses/:id/documents — EMPLOYEE uploads one or many receipts. Documents
 * accumulate (up to MAX_DOCS); new uploads invalidate any prior analysis since it
 * described a different document set.
 */
export async function postExpenseDocuments(
  req: Request,
  res: Response,
): Promise<Response> {
  const uploaded =
    (req as Request & { uploaded?: Express.Multer.File[] }).uploaded ?? [];
  if (!req.user) {
    await Promise.all(uploaded.map(discardUpload));
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);

    if (expense.employeeId !== req.user.userId) {
      await Promise.all(uploaded.map(discardUpload));
      return res
        .status(403)
        .json({ error: "You can only attach documents to your own expenses" });
    }
    // Documents are editable exactly when the expense is: DRAFT or REJECTED. A
    // submitted/under-review/approved expense must not have its receipts swapped.
    if (
      expense.approvalStatus !== "DRAFT" &&
      expense.approvalStatus !== "REJECTED"
    ) {
      await Promise.all(uploaded.map(discardUpload));
      return res
        .status(400)
        .json({ error: "Cannot attach a document to a submitted or reviewed expense" });
    }
    if (uploaded.length === 0) {
      return res.status(400).json({ error: "At least one file is required" });
    }
    const existing = deriveDocumentIds(expense).length;
    if (existing + uploaded.length > MAX_DOCS) {
      await Promise.all(uploaded.map(discardUpload));
      return res
        .status(400)
        .json({ error: `Too many documents (max ${MAX_DOCS})` });
    }

    const views: ExpenseFileView[] = [];
    for (const f of uploaded) {
      const view = await saveExpenseDocument({
        expenseId: id,
        uploadedBy: req.user.userId,
        fileName: f.filename,
        originalFileName: f.originalname,
        mimeType: f.mimetype,
        fileSize: f.size,
      });
      await addExpenseDocumentId(id, view.id);
      views.push(view);
    }
    // New documents invalidate any prior analysis (it described a different set).
    await deleteAnalysisForExpense(id);
    return res.status(201).json(views);
  } catch (err) {
    await Promise.all(uploaded.map(discardUpload));
    return handleError(res, err);
  }
}

/** GET /expenses/:id/documents — owner / HR / ADMIN: all attached documents. */
export async function getExpenseDocuments(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      return res
        .status(403)
        .json({ error: "You do not have access to this expense" });
    }
    return res.status(200).json({ data: await listExpenseDocuments(id) });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /expenses/:id/documents/:docId/file — stream one document's bytes.
 * `?download=1` forces an attachment; otherwise renders inline.
 */
export async function getExpenseDocumentFileById(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const { id, docId } = req.valid?.params as IdParams & { docId: string };
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }
    const doc = await getDocumentById(docId);
    if (!doc || doc.expenseId !== id) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const file = await resolveExpenseDocumentFile(docId);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const safeName = file.originalFileName.replace(/["\\]/g, "_");

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safeName}"`,
    );
    file.stream().pipe(res);
  } catch (err) {
    handleError(res, err);
  }
}

/** DELETE /expenses/:id/documents/:docId — remove one document (DRAFT/REJECTED). */
export async function deleteExpenseDocumentById(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id, docId } = req.valid?.params as IdParams & { docId: string };
    const expense = await requireExpense(id);
    if (expense.employeeId !== req.user.userId) {
      return res
        .status(403)
        .json({ error: "You can only edit your own expenses" });
    }
    if (
      expense.approvalStatus !== "DRAFT" &&
      expense.approvalStatus !== "REJECTED"
    ) {
      return res
        .status(400)
        .json({ error: "Cannot modify a submitted or reviewed expense" });
    }
    const doc = await getDocumentById(docId);
    if (!doc || doc.expenseId !== id) {
      return res.status(404).json({ error: "Document not found" });
    }
    await deleteExpenseDocument(docId);
    await removeExpenseDocumentId(id, docId);
    await deleteAnalysisForExpense(id);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/:id/document — owner / HR / ADMIN: document metadata + file URL. */
export async function getExpenseDocument(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      return res
        .status(403)
        .json({ error: "You do not have access to this document" });
    }
    if (!expense.documentId) {
      return res.status(404).json({ error: "No document attached to this expense" });
    }
    const meta = await getExpenseDocumentMeta(expense.documentId);
    return res.status(200).json(meta);
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /expenses/:id/document/file — owner / HR / ADMIN: stream the file bytes.
 * `?download=1` forces a download (attachment); otherwise it renders inline.
 */
export async function getExpenseDocumentFile(
  req: Request,
  res: Response,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      res.status(403).json({ error: "You do not have access to this document" });
      return;
    }
    if (!expense.documentId) {
      res.status(404).json({ error: "No document attached to this expense" });
      return;
    }
    const file = await resolveExpenseDocumentFile(expense.documentId);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const safeName = file.originalFileName.replace(/["\\]/g, "_");

    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${safeName}"`,
    );

    const stream = file.stream();
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found on the server" });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err) {
    handleError(res, err);
  }
}
