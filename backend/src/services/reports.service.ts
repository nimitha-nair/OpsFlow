import { Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import type { ApprovalStatus } from "../types/expense.types";
import type { ExpenseAnalysisDocument } from "../types/expenseAnalysis.types";
import type {
  AiAnalysisRow,
  AiAnalyticsReport,
  ApprovedExpenseRow,
  ExpensesReport,
  OverviewReport,
  ProjectExpenseAgg,
  ProjectsReport,
  StatusTotals,
} from "../types/reports.types";
import {
  buildAiAnalytics,
  buildMonthlyTrend,
  buildProjectRows,
  clampMonths,
  composeOverviewKpis,
  groupByCategory,
  monthKeys,
  splitByScope,
  summarizeProjects,
  tallyByStatus,
  type ProjectLike,
} from "./reports.aggregate";
import { hasCorrections } from "./ai/analysis-audit";
import { listProjects } from "./project.service";

const ANALYSIS_COLLECTION = "expenseAnalysis";

function tsToIso(value: unknown): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

const EXPENSES_COLLECTION = "expenses";

/** Statuses that count toward reports. DRAFT is excluded (private/unsubmitted). */
const REPORTED_STATUSES: ApprovalStatus[] = [
  "SUBMITTED",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
];

/**
 * Overview KPIs (Total / Approved / Pending / Rejected). Reads the expenses
 * collection once and tallies count + amount per non-DRAFT status in memory; the
 * pure composer derives pending (SUBMITTED + PENDING_REVIEW) and total.
 *
 * This intentionally avoids a filtered `sum()` aggregation, which requires a
 * composite index (approvalStatus, amount) per status and threw
 * FAILED_PRECONDITION when those indexes were not deployed.
 */
export async function getOverviewReport(): Promise<OverviewReport> {
  const snap = await db.collection(EXPENSES_COLLECTION).get();
  const rows = snap.docs.map(
    (d) => d.data() as { approvalStatus?: string; amount?: number },
  );
  return {
    generatedAt: new Date().toISOString(),
    currency: "INR",
    kpis: composeOverviewKpis(tallyByStatus(rows, REPORTED_STATUSES)),
  };
}

/**
 * Expenses analytics over the trailing `months` (clamped 1–24): spend by
 * category, monthly trend, and project-vs-general split — APPROVED expenses only.
 *
 * Uses a single-field query (`approvalStatus == APPROVED`, auto-indexed) and
 * filters the trailing-window by `expenseDate` in memory. This deliberately
 * avoids the composite index (approvalStatus, expenseDate), so the report works
 * regardless of index deployment (it threw FAILED_PRECONDITION otherwise). The
 * three breakdowns are computed in memory from the result set.
 */
export async function getExpensesReport(
  monthsInput: number,
): Promise<ExpensesReport> {
  const months = clampMonths(monthsInput);
  const now = new Date();
  const keys = monthKeys(now, months);
  const from = `${keys[0] ?? now.toISOString().slice(0, 7)}-01`; // first day of earliest month
  const to = now.toISOString().slice(0, 10);

  const snap = await db
    .collection(EXPENSES_COLLECTION)
    .where("approvalStatus", "==", "APPROVED")
    .get();

  const rows: ApprovedExpenseRow[] = snap.docs
    .map((d) => {
      const x = d.data() as {
        category?: string;
        amount?: number;
        scope?: string;
        expenseDate?: string;
      };
      return {
        category: typeof x.category === "string" ? x.category : "MISCELLANEOUS",
        amount: typeof x.amount === "number" ? x.amount : 0,
        scope: x.scope === "GENERAL" ? "GENERAL" : "PROJECT",
        expenseDate: typeof x.expenseDate === "string" ? x.expenseDate : from,
      } as ApprovedExpenseRow;
    })
    // Trailing-window filter in memory (avoids the composite-index range query).
    .filter((r) => r.expenseDate >= from);

  return {
    range: { from, to, months },
    spendByCategory: groupByCategory(rows),
    monthlyTrend: buildMonthlyTrend(rows, months, now),
    byScope: splitByScope(rows),
  };
}

/**
 * Projects analytics: per-project approved spend vs budget, remaining, and
 * utilization. Queries APPROVED expenses only (not the whole collection) and
 * groups by projectId in memory; projects without a budget get null
 * remaining/utilization.
 */
export async function getProjectsReport(): Promise<ProjectsReport> {
  const [projectsPage, approvedSnap] = await Promise.all([
    listProjects({ page: 1, limit: 100000 }),
    db
      .collection(EXPENSES_COLLECTION)
      .where("approvalStatus", "==", "APPROVED")
      .get(),
  ]);

  const spentByProject = new Map<string, ProjectExpenseAgg>();
  for (const d of approvedSnap.docs) {
    const x = d.data() as { projectId?: string; amount?: number };
    if (!x.projectId) continue; // GENERAL expenses don't count toward a project
    const agg = spentByProject.get(x.projectId) ?? { amount: 0, count: 0 };
    agg.amount += typeof x.amount === "number" ? x.amount : 0;
    agg.count += 1;
    spentByProject.set(x.projectId, agg);
  }

  const projects: ProjectLike[] = projectsPage.data.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    budget: p.budget,
    archived: p.archived,
  }));
  const rows = buildProjectRows(projects, spentByProject);

  return {
    generatedAt: new Date().toISOString(),
    currency: "INR",
    totals: summarizeProjects(rows),
    projects: rows,
  };
}

/**
 * AI analytics over the expenseAnalysis collection: status mix, confidence,
 * success/low-confidence/correction rates, provider distribution, processing
 * time, token usage, and a low-confidence monthly trend. Reads the analysis docs
 * (correction-rate/distribution/trend can't be derived from aggregations); the
 * collection is bounded to ~one row per analyzed expense. Metrics that depend on
 * newly-tracked fields are null until runs populate them.
 */
export async function getAiAnalyticsReport(
  monthsInput: number,
): Promise<AiAnalyticsReport> {
  const months = clampMonths(monthsInput);
  const now = new Date();
  const [snap, expensesSnap] = await Promise.all([
    db.collection(ANALYSIS_COLLECTION).get(),
    db.collection(EXPENSES_COLLECTION).get(),
  ]);

  const rows: AiAnalysisRow[] = snap.docs.map((d) => {
    const x = d.data() as Partial<ExpenseAnalysisDocument>;
    const confirmed = Boolean(x.confirmedAt);
    const row: AiAnalysisRow = {
      status: (x.status ?? "PENDING") as AiAnalysisRow["status"],
      confirmed,
      corrected: confirmed ? hasCorrections(x) : false,
      createdAt: tsToIso(x.createdAt),
    };
    if (typeof x.provider === "string") row.provider = x.provider;
    if (typeof x.confidenceScore === "number")
      row.confidenceScore = x.confidenceScore;
    if (typeof x.processingMs === "number") row.processingMs = x.processingMs;
    if (typeof x.tokensUsed === "number") row.tokensUsed = x.tokensUsed;
    // Forward-only: absent documentIds → undefined → counted as a single doc.
    if (Array.isArray(x.documentIds)) row.documentCount = x.documentIds.length;
    return row;
  });

  // Creation-method split comes from the expenses side (analysis rows don't carry
  // it). Forward-only: expenses without creationMethod count as "unknown".
  const creationMethods = expensesSnap.docs.map((d) => {
    const m = (d.data() as { creationMethod?: string }).creationMethod;
    return m === "AI" || m === "MANUAL" ? m : undefined;
  });

  return buildAiAnalytics(rows, now, months, creationMethods);
}
