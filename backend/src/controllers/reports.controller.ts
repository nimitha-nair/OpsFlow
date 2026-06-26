import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import {
  FIRESTORE_UNAVAILABLE_MESSAGE,
  isFirestoreQuotaError,
} from "../utils/firestore";
import {
  getAiAnalyticsReport,
  getExpensesReport,
  getOverviewReport,
  getProjectsReport,
} from "../services/reports.service";
import type {
  AiQuery,
  ExpensesQuery,
  OverviewQuery,
  ProjectsQuery,
} from "../validation/reports.schema";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  // Firestore quota/rate-limit/unavailable → 503 with a retry message, never a
  // generic 500 or a crash. These analytics endpoints are the heaviest readers.
  if (isFirestoreQuotaError(err)) {
    const code = (err as { code?: number }).code;
    console.warn(`Reports: Firestore unavailable (gRPC ${code})`);
    return res.status(503).json({ error: FIRESTORE_UNAVAILABLE_MESSAGE });
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
    const { from, to, basis, currency } = (req.valid?.query ?? {}) as OverviewQuery;
    const report = await getOverviewReport(from, to, basis, currency);
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /reports/expenses?from&to — ADMIN/HR: spend by category / month / scope. */
export async function getExpenses(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { from, to, basis, currency } = (req.valid?.query ?? {}) as ExpensesQuery;
    const report = await getExpensesReport(from, to, basis, currency);
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
    const { from, to, basis, currency } = (req.valid?.query ?? {}) as ProjectsQuery;
    const report = await getProjectsReport(from, to, basis, currency);
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
    const { from, to } = (req.valid?.query ?? {}) as AiQuery;
    const report = await getAiAnalyticsReport(from, to);
    return res.status(200).json(report);
  } catch (err) {
    return handleError(res, err);
  }
}
