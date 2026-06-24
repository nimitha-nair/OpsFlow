import { api } from "./api";
import type {
  AiAnalyticsReport,
  ExpensesReport,
  OverviewReport,
  ProjectsReport,
} from "../types/reports";

/** ADMIN/HR: expense KPI totals for the Reports → Overview tab. */
export async function getReportsOverview(
  params: { from?: string; to?: string; basis?: "expenseDate" | "submittedAt" } = {},
): Promise<OverviewReport> {
  const { data } = await api.get<OverviewReport>("/reports/overview", { params });
  return data;
}

/** ADMIN/HR: spend analytics (category / monthly trend / scope) for a date range. */
export async function getReportsExpenses(
  params: { from?: string; to?: string; basis?: "expenseDate" | "submittedAt" } = {},
): Promise<ExpensesReport> {
  const { data } = await api.get<ExpensesReport>("/reports/expenses", { params });
  return data;
}

/** ADMIN: project spend vs budget / utilization. */
export async function getReportsProjects(
  params: { from?: string; to?: string; basis?: "expenseDate" | "submittedAt" } = {},
): Promise<ProjectsReport> {
  const { data } = await api.get<ProjectsReport>("/reports/projects", { params });
  return data;
}

/** ADMIN: AI Expense Intelligence analytics. */
export async function getReportsAiAnalytics(
  params: { from?: string; to?: string } = {},
): Promise<AiAnalyticsReport> {
  const { data } = await api.get<AiAnalyticsReport>("/reports/ai", { params });
  return data;
}
