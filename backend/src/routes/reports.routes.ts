import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import {
  aiQuery,
  expensesQuery,
  overviewQuery,
  projectsQuery,
} from "../validation/reports.schema";
import UserRole from "../types/roles";
import {
  getAiAnalytics,
  getExpenses,
  getOverview,
  getProjects,
} from "../controllers/reports.controller";

const router = Router();

// ADMIN + HR — Overview KPIs.
router.get(
  "/overview",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ query: overviewQuery }),
  getOverview,
);

// ADMIN + HR — Expenses analytics (category / monthly trend / scope split).
router.get(
  "/expenses",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ query: expensesQuery }),
  getExpenses,
);

// ADMIN only — Projects analytics (spend vs budget / utilization).
router.get(
  "/projects",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: projectsQuery }),
  getProjects,
);

// ADMIN only — AI Expense Intelligence analytics.
router.get(
  "/ai",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ query: aiQuery }),
  getAiAnalytics,
);

export default router;
