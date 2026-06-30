import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { uploadReceipts } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import {
  approveExpenseBody,
  createExpenseBody,
  expenseDocParams,
  expenseProjectParams,
  listExpensesQuery,
  myExpensesQuery,
  paginatedDateRangeQuery,
  reimbursementBody,
  rejectExpenseBody,
  reviewExpensesQuery,
  updateExpenseBody,
} from "../validation/expense.schema";
import {
  deleteExpense,
  getExpense,
  getExpenseDocument,
  getExpenseDocumentFile,
  getExpenses,
  getMyExpenses,
  getPendingExpenses,
  getReimbursements,
  getProjectExpenses,
  getProjectsSpending,
  getReviewExpenses,
  getReviewInfo,
  patchApprove,
  patchExpense,
  patchReimbursement,
  patchReject,
  patchStartReview,
  postExpense,
  postExpenseDocuments,
  getExpenseDocuments,
  getExpenseDocumentFileById,
  deleteExpenseDocumentById,
  postSubmitExpense,
} from "../controllers/expense.controller";
import {
  getAnalysis,
  patchAnalysis,
  postAnalyze,
} from "../controllers/expenseAnalysis.controller";
import { updateAnalysisBody } from "../validation/expenseAnalysis.schema";

const router = Router();

// EMPLOYEE — submit.
router.post(
  "/",
  authenticate,
  requirePermission("expense:create"),
  validate({ body: createExpenseBody }),
  postExpense,
);

// Literal segments registered before "/:id".
router.get(
  "/my-expenses",
  authenticate,
  requirePermission("expense:view-own"),
  validate({ query: myExpensesQuery }),
  getMyExpenses,
);
router.get(
  "/pending",
  authenticate,
  requirePermission("expense:review"),
  validate({ query: paginatedDateRangeQuery }),
  getPendingExpenses,
);
router.get(
  "/reimbursements",
  authenticate,
  requirePermission("expense:view-all"),
  validate({ query: paginatedDateRangeQuery }),
  getReimbursements,
);

// HR & ADMIN — lifecycle list filtered by status (Pending/Approved/Rejected/All).
router.get(
  "/review",
  authenticate,
  requirePermission("expense:view-all"),
  validate({ query: reviewExpensesQuery }),
  getReviewExpenses,
);

// ADMIN — spending across all projects (approved expenses only).
router.get(
  "/projects-spending",
  authenticate,
  requirePermission("expense:view-all"),
  getProjectsSpending,
);
router.get(
  "/project/:projectId",
  authenticate,
  requirePermission("expense:view-all"),
  validate({ params: expenseProjectParams }),
  getProjectExpenses,
);

// ADMIN — approved expenses overview.
router.get(
  "/",
  authenticate,
  requirePermission("expense:view-all"),
  validate({ query: listExpensesQuery }),
  getExpenses,
);

// owner / HR / ADMIN(approved) — single expense (refined in controller).
router.get(
  "/:id",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getExpense,
);

// EMPLOYEE — edit / submit own DRAFT.
router.patch(
  "/:id",
  authenticate,
  requirePermission("expense:edit-own"),
  validate({ params: idParams, body: updateExpenseBody }),
  patchExpense,
);
router.post(
  "/:id/submit",
  authenticate,
  requirePermission("expense:submit"),
  validate({ params: idParams }),
  postSubmitExpense,
);

// EMPLOYEE — delete own DRAFT (removes the linked document file/record too).
router.delete(
  "/:id",
  authenticate,
  requirePermission("expense:delete-own"),
  validate({ params: idParams }),
  deleteExpense,
);

// EMPLOYEE — upload one or many receipts/invoices for their expense.
router.post(
  "/:id/documents",
  authenticate,
  requirePermission("expense:create"),
  validate({ params: idParams }),
  uploadReceipts,
  postExpenseDocuments,
);

// owner / HR / ADMIN(non-draft) — list all attached documents.
router.get(
  "/:id/documents",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getExpenseDocuments,
);

// owner / HR / ADMIN(non-draft) — stream one document by id (view/download).
router.get(
  "/:id/documents/:docId/file",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: expenseDocParams }),
  getExpenseDocumentFileById,
);

// EMPLOYEE — remove one document from their DRAFT/REJECTED expense.
router.delete(
  "/:id/documents/:docId",
  authenticate,
  requirePermission("expense:edit-own"),
  validate({ params: expenseDocParams }),
  deleteExpenseDocumentById,
);

// owner / HR / ADMIN — latest review decision (status, reviewer, date, remarks).
router.get(
  "/:id/review-info",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getReviewInfo,
);

// owner / HR / ADMIN(approved) — document metadata + file URL.
router.get(
  "/:id/document",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getExpenseDocument,
);

// owner / HR / ADMIN(approved) — stream the document bytes (view/download).
router.get(
  "/:id/document/file",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getExpenseDocumentFile,
);

// HR — claim a submitted expense for review (SUBMITTED → PENDING_REVIEW).
router.patch(
  "/:id/review",
  authenticate,
  requirePermission("expense:review"),
  validate({ params: idParams }),
  patchStartReview,
);

// HR — approve / reject.
router.patch(
  "/:id/approve",
  authenticate,
  requirePermission("expense:review"),
  validate({ params: idParams, body: approveExpenseBody }),
  patchApprove,
);
router.patch(
  "/:id/reject",
  authenticate,
  requirePermission("expense:review"),
  validate({ params: idParams, body: rejectExpenseBody }),
  patchReject,
);

// ADMIN — set reimbursement status (approved expenses only).
router.patch(
  "/:id/reimbursement",
  authenticate,
  requirePermission("expense:reimburse"),
  validate({ params: idParams, body: reimbursementBody }),
  patchReimbursement,
);

// EMPLOYEE — trigger AI analysis of the receipt (async; client polls).
router.post(
  "/:id/analyze",
  authenticate,
  requirePermission("expense:create"),
  validate({ params: idParams }),
  postAnalyze,
);

// owner / HR / ADMIN — read the analysis result.
router.get(
  "/:id/analysis",
  authenticate,
  requirePermission("expense:view-own", "expense:view-all"),
  validate({ params: idParams }),
  getAnalysis,
);

// EMPLOYEE — edit/confirm extracted values (confirm writes back to the expense).
router.patch(
  "/:id/analysis",
  authenticate,
  requirePermission("expense:edit-own"),
  validate({ params: idParams, body: updateAnalysisBody }),
  patchAnalysis,
);

export default router;
