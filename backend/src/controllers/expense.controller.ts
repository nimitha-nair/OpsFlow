import { unlink } from "node:fs/promises";

import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { JwtPayload } from "../types/auth.types";
import type {
  ExpenseDocument,
  ReimbursementStatus,
} from "../types/expense.types";
import {
  approveExpense,
  createExpense,
  deleteDraftExpense,
  getExpenseById,
  getLatestReview,
  listApprovedExpenses,
  listExpensesByStatus,
  listMyExpenses,
  listPendingExpenses,
  listProjectsSpending,
  getProjectSpending,
  rejectExpense,
  requireExpense,
  setExpenseDocumentId,
  setReimbursementStatus,
  startReview,
  submitExpense,
  updateExpense,
} from "../services/expense.service";
import {
  deleteExpenseDocument,
  getExpenseDocumentMeta,
  resolveExpenseDocumentFile,
  saveExpenseDocument,
} from "../services/expense-document.service";
import { deleteAnalysisForExpense } from "../services/expenseAnalysis.service";
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
    const data = await listMyExpenses(req.user.userId);
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/pending — HR review queue. */
export async function getPendingExpenses(
  _req: Request,
  res: Response,
): Promise<Response> {
  try {
    const data = await listPendingExpenses();
    return res.status(200).json({ data });
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
    const { status } = (req.valid?.query ?? {}) as {
      status?: ExpenseStatusFilter;
    };
    const data = await listExpensesByStatus(status ?? "ALL");
    return res.status(200).json({ data });
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

/** POST /expenses/:id/documents — EMPLOYEE uploads a receipt for their expense. */
export async function postExpenseDocument(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    await discardUpload(req.file);
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);

    if (expense.employeeId !== req.user.userId) {
      await discardUpload(req.file);
      return res
        .status(403)
        .json({ error: "You can only attach documents to your own expenses" });
    }
    // Documents are editable exactly when the expense is: DRAFT or REJECTED. A
    // submitted/under-review/approved expense must not have its receipt swapped.
    if (
      expense.approvalStatus !== "DRAFT" &&
      expense.approvalStatus !== "REJECTED"
    ) {
      await discardUpload(req.file);
      return res
        .status(400)
        .json({ error: "Cannot attach a document to a submitted or reviewed expense" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "A file is required" });
    }

    // Replacing an existing document: drop the old file + record first, and
    // invalidate any prior analysis (it described the now-removed receipt).
    if (expense.documentId) {
      await deleteExpenseDocument(expense.documentId);
      await deleteAnalysisForExpense(id);
    }

    const view = await saveExpenseDocument({
      expenseId: id,
      uploadedBy: req.user.userId,
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });
    await setExpenseDocumentId(id, view.id);
    return res.status(201).json(view);
  } catch (err) {
    await discardUpload(req.file);
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
