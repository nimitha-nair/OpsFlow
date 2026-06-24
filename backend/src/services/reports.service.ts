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
  composeOverviewKpis,
  groupByCategory,
  splitByScope,
  summarizeProjects,
  tallyByStatus,
  type ProjectLike,
} from "./reports.aggregate";
import { hasCorrections } from "./ai/analysis-audit";
import { listProjects } from "./project.service";
import { filterByDateWindow } from "../utils/date-window";

const ANALYSIS_COLLECTION = "expenseAnalysis";

/**
 * Derive the number of calendar months a monthly-trend chart should cover from
 * an inclusive ISO date window. Pure helper (tested in reports.service.test.ts):
 *   - unbounded (or a single bound, or unparseable input) ⇒ 12
 *   - otherwise the inclusive count of distinct calendar months spanned
 * Clamped to [1, 24] (mirrors `clampMonths`).
 */
export function monthsBetween(from?: string, to?: string): number {
  if (!from || !to) return 12;
  const f = new Date(from);
  const t = new Date(to);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return 12;
  const span =
    (t.getFullYear() - f.getFullYear()) * 12 +
    (t.getMonth() - f.getMonth()) +
    1; // inclusive of both endpoint months
  return Math.min(24, Math.max(1, span));
}

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
export async function getOverviewReport(
  from?: string,
  to?: string,
): Promise<OverviewReport> {
  const snap = await db.collection(EXPENSES_COLLECTION).get();
  const allRows = snap.docs.map(
    (d) =>
      d.data() as {
        approvalStatus?: string;
        amount?: number;
        expenseDate?: string;
      },
  );
  // Apply the optional date window in memory (no composite index needed).
  const rows = filterByDateWindow(allRows, (r) => r.expenseDate, from, to);
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
  from?: string,
  to?: string,
): Promise<ExpensesReport> {
  const now = new Date();
  // The window drives both the filter and the monthly-trend bucket count.
  const months = monthsBetween(from, to);
  const fallbackDate = now.toISOString().slice(0, 10);

  const snap = await db
    .collection(EXPENSES_COLLECTION)
    .where("approvalStatus", "==", "APPROVED")
    .get();

  const allRows: ApprovedExpenseRow[] = snap.docs.map((d) => {
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
      expenseDate:
        typeof x.expenseDate === "string" ? x.expenseDate : fallbackDate,
    } as ApprovedExpenseRow;
  });

  // Apply the optional date window in memory (avoids a composite-index range query).
  const rows = filterByDateWindow(allRows, (r) => r.expenseDate, from, to);

  return {
    range: { from: from ?? null, to: to ?? null },
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
export async function getProjectsReport(
  from?: string,
  to?: string,
): Promise<ProjectsReport> {
  const [projectsPage, approvedSnap] = await Promise.all([
    listProjects({ page: 1, limit: 100000 }),
    db
      .collection(EXPENSES_COLLECTION)
      .where("approvalStatus", "==", "APPROVED")
      .get(),
  ]);

  const spentByProject = new Map<string, ProjectExpenseAgg>();
  // Apply the optional date window in memory before aggregating.
  const approvedDocs = filterByDateWindow(
    approvedSnap.docs.map((d) => d.data() as Record<string, unknown>),
    (x) => x.expenseDate,
    from,
    to,
  );
  for (const x of approvedDocs as { projectId?: string; amount?: number }[]) {
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
  from?: string,
  to?: string,
): Promise<AiAnalyticsReport> {
  const months = monthsBetween(from, to);
  const now = new Date();
  const [snap, expensesSnap] = await Promise.all([
    db.collection(ANALYSIS_COLLECTION).get(),
    db.collection(EXPENSES_COLLECTION).get(),
  ]);

  const allRows: AiAnalysisRow[] = snap.docs.map((d) => {
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

  // Apply the optional date window to analyses by their createdAt (ISO).
  const rows = filterByDateWindow(allRows, (r) => r.createdAt, from, to);

  // Creation-method split comes from the expenses side (analysis rows don't carry
  // it). Forward-only: expenses without creationMethod count as "unknown". The
  // expenses are windowed by expenseDate so adoption matches the report range.
  const windowedExpenses = filterByDateWindow(
    expensesSnap.docs.map((d) => d.data() as Record<string, unknown>),
    (x) => x.expenseDate,
    from,
    to,
  );
  const creationMethods = windowedExpenses.map((x) => {
    const m = (x as { creationMethod?: string }).creationMethod;
    return m === "AI" || m === "MANUAL" ? m : undefined;
  });

  return buildAiAnalytics(rows, now, months, creationMethods);
}
