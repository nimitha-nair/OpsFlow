import { AggregateField, Timestamp } from "firebase-admin/firestore";

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
 * Count + summed amount for one status via a server-side Firestore aggregation.
 * This does NOT read the matching documents — count/sum are computed index-side
 * (~1 read per 1000 entries), so there is no full-collection scan.
 */
async function statusTotals(status: ApprovalStatus): Promise<StatusTotals> {
  const snap = await db
    .collection(EXPENSES_COLLECTION)
    .where("approvalStatus", "==", status)
    .aggregate({
      count: AggregateField.count(),
      amount: AggregateField.sum("amount"),
    })
    .get();
  const data = snap.data();
  return {
    count: typeof data.count === "number" ? data.count : 0,
    amount: typeof data.amount === "number" ? data.amount : 0,
  };
}

/**
 * Overview KPIs (Total / Approved / Pending / Rejected). One aggregation query
 * per non-DRAFT status (4 total), run concurrently; the pure composer derives
 * pending (SUBMITTED + PENDING_REVIEW) and total (all non-DRAFT).
 */
export async function getOverviewReport(): Promise<OverviewReport> {
  const entries = await Promise.all(
    REPORTED_STATUSES.map(
      async (status) => [status, await statusTotals(status)] as const,
    ),
  );
  const byStatus = Object.fromEntries(entries) as Partial<
    Record<ApprovalStatus, StatusTotals>
  >;

  return {
    generatedAt: new Date().toISOString(),
    currency: "INR",
    kpis: composeOverviewKpis(byStatus),
  };
}

/**
 * Expenses analytics over the trailing `months` (clamped 1–24): spend by
 * category, monthly trend, and project-vs-general split — APPROVED expenses only.
 *
 * One windowed, indexed query (`approvalStatus == APPROVED` AND
 * `expenseDate >= cutoff`, ordered by `expenseDate`) reads only the approved
 * expenses inside the window — not the whole collection. Requires the composite
 * index (approvalStatus ASC, expenseDate ASC) in firestore.indexes.json. All
 * three breakdowns are then computed in memory from that single result set.
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
    .where("expenseDate", ">=", from)
    .orderBy("expenseDate", "asc")
    .get();

  const rows: ApprovedExpenseRow[] = snap.docs.map((d) => {
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
    };
  });

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
