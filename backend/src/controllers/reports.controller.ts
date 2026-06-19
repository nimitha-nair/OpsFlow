import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import {
  getAiAnalyticsReport,
  getExpensesReport,
  getOverviewReport,
  getProjectsReport,
} from "../services/reports.service";
import type { AiQuery, ExpensesQuery } from "../validation/reports.schema";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected reports error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** GET /reports/overview — ADMIN/HR: expense KPI totals. */
export async function getOverview(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const report = await getOverviewReport();
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /reports/expenses?months=N — ADMIN/HR: spend by category / month / scope. */
export async function getExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { months } = req.valid?.query as ExpensesQuery;
    const report = await getExpensesReport(months);
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /reports/projects — ADMIN: spend vs budget / utilization per project. */
export async function getProjects(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const report = await getProjectsReport();
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /reports/ai — ADMIN: AI Expense Intelligence analytics. */
export async function getAiAnalytics(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { months } = req.valid?.query as AiQuery;
    const report = await getAiAnalyticsReport(months);
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}
