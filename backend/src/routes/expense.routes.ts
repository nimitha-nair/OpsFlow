import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { uploadReceipts } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { dateRangeQuery, idParams } from "../validation/common";
import {
  approveExpenseBody,
  createExpenseBody,
  expenseDocParams,
  expenseProjectParams,
  listExpensesQuery,
  myExpensesQuery,
  reimbursementBody,
  rejectExpenseBody,
  reviewExpensesQuery,
  updateExpenseBody,
} from "../validation/expense.schema";
import UserRole from "../types/roles";
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
  authorize(UserRole.EMPLOYEE),
  validate({ body: createExpenseBody }),
  postExpense,
);

// Literal segments registered before "/:id".
router.get(
  "/my-expenses",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ query: myExpensesQuery }),
  getMyExpenses,
);
router.get(
  "/pending",
  authenticate,
  authorize(UserRole.HR),
  validate({ query: dateRangeQuery }),
  getPendingExpenses,
);
router.get(
  "/reimbursements",
  authenticate,
  authorize(UserRole.HR, UserRole.ADMIN),
  validate({ query: dateRangeQuery }),
  getReimbursements,
);

// HR & ADMIN — lifecycle list filtered by status (Pending/Approved/Rejected/All).
router.get(
  "/review",
  authenticate,
  authorize(UserRole.HR, UserRole.ADMIN),
  validate({ query: reviewExpensesQuery }),
  getReviewExpenses,
);

// ADMIN — spending across all projects (approved expenses only).
router.get(
  "/projects-spending",
  authenticate,
  authorize(UserRole.ADMIN),
  getProjectsSpending,
);
router.get(
  "/project/:projectId",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: expenseProjectParams }),
  getProjectExpenses,
);

// ADMIN — approved expenses overview.
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: listExpensesQuery }),
  getExpenses,
);

// owner / HR / ADMIN(approved) — single expense (refined in controller).
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getExpense,
);

// EMPLOYEE — edit / submit own DRAFT.
router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams, body: updateExpenseBody }),
  patchExpense,
);
router.post(
  "/:id/submit",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  postSubmitExpense,
);

// EMPLOYEE — delete own DRAFT (removes the linked document file/record too).
router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  deleteExpense,
);

// EMPLOYEE — upload one or many receipts/invoices for their expense.
router.post(
  "/:id/documents",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  uploadReceipts,
  postExpenseDocuments,
);

// owner / HR / ADMIN(non-draft) — list all attached documents.
router.get(
  "/:id/documents",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getExpenseDocuments,
);

// owner / HR / ADMIN(non-draft) — stream one document by id (view/download).
router.get(
  "/:id/documents/:docId/file",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: expenseDocParams }),
  getExpenseDocumentFileById,
);

// EMPLOYEE — remove one document from their DRAFT/REJECTED expense.
router.delete(
  "/:id/documents/:docId",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: expenseDocParams }),
  deleteExpenseDocumentById,
);

// owner / HR / ADMIN — latest review decision (status, reviewer, date, remarks).
router.get(
  "/:id/review-info",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getReviewInfo,
);

// owner / HR / ADMIN(approved) — document metadata + file URL.
router.get(
  "/:id/document",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getExpenseDocument,
);

// owner / HR / ADMIN(approved) — stream the document bytes (view/download).
router.get(
  "/:id/document/file",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getExpenseDocumentFile,
);

// HR — claim a submitted expense for review (SUBMITTED → PENDING_REVIEW).
router.patch(
  "/:id/review",
  authenticate,
  authorize(UserRole.HR),
  validate({ params: idParams }),
  patchStartReview,
);

// HR — approve / reject.
router.patch(
  "/:id/approve",
  authenticate,
  authorize(UserRole.HR),
  validate({ params: idParams, body: approveExpenseBody }),
  patchApprove,
);
router.patch(
  "/:id/reject",
  authenticate,
  authorize(UserRole.HR),
  validate({ params: idParams, body: rejectExpenseBody }),
  patchReject,
);

// ADMIN — set reimbursement status (approved expenses only).
router.patch(
  "/:id/reimbursement",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams, body: reimbursementBody }),
  patchReimbursement,
);

// EMPLOYEE — trigger AI analysis of the receipt (async; client polls).
router.post(
  "/:id/analyze",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  postAnalyze,
);

// owner / HR / ADMIN — read the analysis result.
router.get(
  "/:id/analysis",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getAnalysis,
);

// EMPLOYEE — edit/confirm extracted values (confirm writes back to the expense).
router.patch(
  "/:id/analysis",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams, body: updateAnalysisBody }),
  patchAnalysis,
);

export default router;
