import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { JwtPayload } from "../types/auth.types";
import { requireExpense } from "../services/expense.service";
import {
  analyzeExpense,
  getAnalysisByExpenseId,
  updateAnalysis,
  type UpdateAnalysisInput,
} from "../services/expenseAnalysis.service";
import type { ExpenseDocument } from "../types/expense.types";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected expense-analysis error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Owner, HR, and ADMIN may read analysis (not employees' private drafts of others). */
function canViewAnalysis(expense: ExpenseDocument, user: JwtPayload): boolean {
  if (user.role === UserRole.HR || user.role === UserRole.ADMIN) {
    return expense.approvalStatus !== "DRAFT";
  }
  return expense.employeeId === user.userId;
}

/** POST /expenses/:id/analyze — EMPLOYEE owner triggers analysis. */
export async function postAnalyze(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const analysis = await analyzeExpense(id, req.user.userId);
    return res.status(202).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/:id/analysis — owner / HR / ADMIN. */
export async function getAnalysis(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canViewAnalysis(expense, req.user)) {
      return res.status(403).json({ error: "You do not have access to this analysis" });
    }
    const analysis = await getAnalysisByExpenseId(id);
    // Receipt risk/authenticity is for reviewers (HR/Admin) only — never expose
    // it to the submitting employee, so they can't iterate against the detector.
    const isStaff =
      req.user.role === UserRole.HR || req.user.role === UserRole.ADMIN;
    if (analysis && !isStaff) {
      delete (analysis as Partial<typeof analysis>).authenticityScore;
      delete (analysis as Partial<typeof analysis>).riskLevel;
      delete (analysis as Partial<typeof analysis>).riskReasons;
    }
    return res.status(200).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/analysis — EMPLOYEE owner edits/confirms. */
export async function patchAnalysis(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const patch = req.valid?.body as UpdateAnalysisInput;
    const analysis = await updateAnalysis(id, req.user.userId, patch);
    return res.status(200).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}
