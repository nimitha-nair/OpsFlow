import { api } from "./api";
import type {
  AiAnalyticsReport,
  ExpensesReport,
  OverviewReport,
  ProjectsReport,
} from "../types/reports";

/** ADMIN/HR: expense KPI totals for the Reports → Overview tab. */
export async function getReportsOverview(): Promise<OverviewReport> {
  const { data } = await api.get<OverviewReport>("/reports/overview");
  return data;
}

/** ADMIN/HR: spend analytics (category / monthly trend / scope) for a trailing window. */
export async function getReportsExpenses(months = 12): Promise<ExpensesReport> {
  const { data } = await api.get<ExpensesReport>("/reports/expenses", {
    params: { months },
  });
  return data;
}

/** ADMIN: project spend vs budget / utilization. */
export async function getReportsProjects(): Promise<ProjectsReport> {
  const { data } = await api.get<ProjectsReport>("/reports/projects");
  return data;
}

/** ADMIN: AI Expense Intelligence analytics. */
export async function getReportsAiAnalytics(
  months = 12,
): Promise<AiAnalyticsReport> {
  const { data } = await api.get<AiAnalyticsReport>("/reports/ai", {
    params: { months },
  });
  return data;
}
