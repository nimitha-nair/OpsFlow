import type { ApprovalStatus } from "../types/expense.types";
import type {
  AiAnalysisRow,
  AiAnalyticsReport,
  ApprovedExpenseRow,
  CategorySpend,
  ConfidenceBucket,
  MonthlySpend,
  OverviewKpis,
  ProjectExpenseAgg,
  ProjectReportRow,
  ProviderCount,
  ScopeSplit,
  StatusTotals,
} from "../types/reports.types";

const ZERO: StatusTotals = { count: 0, amount: 0 };

/**
 * Tally count + summed amount per approval status from raw expense rows, keeping
 * only the `reported` statuses (DRAFT is excluded). Pure so the overview KPIs can
 * be computed in memory without a filtered `sum()` aggregation (which needs a
 * composite index per status).
 */
export function tallyByStatus(
  rows: Array<{ approvalStatus?: string; amount?: number }>,
  reported: readonly ApprovalStatus[],
): Partial<Record<ApprovalStatus, StatusTotals>> {
  const out: Partial<Record<ApprovalStatus, StatusTotals>> = {};
  for (const r of rows) {
    const status = r.approvalStatus as ApprovalStatus | undefined;
    if (!status || !reported.includes(status)) continue;
    const cur = out[status] ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += typeof r.amount === "number" ? r.amount : 0;
    out[status] = cur;
  }
  return out;
}

/** Round to 2dp to avoid floating-point drift when summing currency amounts. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumTotals(...totals: StatusTotals[]): StatusTotals {
  return totals.reduce(
    (acc, t) => ({ count: acc.count + t.count, amount: acc.amount + t.amount }),
    ZERO,
  );
}

/**
 * Compose the Overview KPI block from per-status {count, amount} tallies. Pure —
 * the Firestore aggregation queries live in reports.service. Definitions:
 *   approved = APPROVED · rejected = REJECTED
 *   pending  = SUBMITTED + PENDING_REVIEW
 *   total    = all non-DRAFT (approved + pending + rejected)
 * DRAFT is ignored even if present (private, unsubmitted).
 */
export function composeOverviewKpis(
  byStatus: Partial<Record<ApprovalStatus, StatusTotals>>,
): OverviewKpis {
  const at = (s: ApprovalStatus): StatusTotals => byStatus[s] ?? ZERO;
  const approved = at("APPROVED");
  const rejected = at("REJECTED");
  const pending = sumTotals(at("SUBMITTED"), at("PENDING_REVIEW"));
  const total = sumTotals(approved, pending, rejected);
  const fix = (t: StatusTotals): StatusTotals => ({
    count: t.count,
    amount: round2(t.amount),
  });
  return {
    total: fix(total),
    approved: fix(approved),
    pending: fix(pending),
    rejected: fix(rejected),
  };
}

// ── Multi-currency (group-by-currency reporting) ──────────────────────────────

/** Per-currency count + summed amount for one slice of expenses. */
export interface CurrencyTotal {
  currency: string;
  count: number;
  amount: number;
}

/** Normalize a raw currency value to a non-empty uppercase code (default INR). */
export function normalizeCurrency(value: unknown): string {
  if (typeof value !== "string") return "INR";
  const code = value.trim().toUpperCase();
  return code.length > 0 ? code : "INR";
}

/**
 * Tally count + amount per currency, descending by amount (ties: code asc). The
 * group-by-currency strategy never sums across currencies — analytics scope to a
 * single active currency and this summary lists every currency present so the UI
 * can offer a breakdown/selector.
 */
export function totalsByCurrency(
  rows: Array<{ currency?: unknown; amount?: number }>,
): CurrencyTotal[] {
  const map = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const currency = normalizeCurrency(r.currency);
    const b = map.get(currency) ?? { count: 0, amount: 0 };
    b.count += 1;
    b.amount += typeof r.amount === "number" ? r.amount : 0;
    map.set(currency, b);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({ currency, count: v.count, amount: round2(v.amount) }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

/**
 * Choose the currency analytics should scope to: the requested one when it has
 * data in range, otherwise the dominant currency (largest amount), falling back
 * to INR when there is no data at all.
 */
export function pickActiveCurrency(
  totals: CurrencyTotal[],
  requested?: string,
): string {
  if (requested) {
    const norm = normalizeCurrency(requested);
    if (totals.some((t) => t.currency === norm)) return norm;
  }
  return totals[0]?.currency ?? "INR";
}

// ── Expenses analytics (Phase 2) ──────────────────────────────────────────────

/** Clamp a requested month window to the supported 1–24 (default 12 for junk). */
export function clampMonths(n: number): number {
  if (!Number.isFinite(n)) return 12;
  return Math.min(24, Math.max(1, Math.round(n)));
}

/**
 * The trailing `months` "YYYY-MM" keys ending at `ref`'s month, oldest → newest.
 * `ref` is injected so this stays pure/testable.
 */
export function monthKeys(ref: Date, months: number): string[] {
  const span = clampMonths(months);
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-based
  const keys: string[] = [];
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(year, month - i, 1); // JS normalizes month underflow
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Spend + count per category, descending by amount (ties broken by name). */
export function groupByCategory(rows: ApprovedExpenseRow[]): CategorySpend[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const b = map.get(r.category) ?? { amount: 0, count: 0 };
    b.amount += r.amount;
    b.count += 1;
    map.set(r.category, b);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, amount: round2(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

/** Monthly totals across the trailing `months`, zero-padded, oldest → newest. */
export function buildMonthlyTrend(
  rows: ApprovedExpenseRow[],
  months: number,
  ref: Date,
): MonthlySpend[] {
  const keys = monthKeys(ref, months);
  const map = new Map<string, { amount: number; count: number }>(
    keys.map((k) => [k, { amount: 0, count: 0 }]),
  );
  for (const r of rows) {
    const bucket = map.get(r.expenseDate.slice(0, 7)); // YYYY-MM
    if (bucket) {
      bucket.amount += r.amount;
      bucket.count += 1;
    }
  }
  return keys.map((k) => {
    const v = map.get(k) ?? { amount: 0, count: 0 };
    return { month: k, amount: round2(v.amount), count: v.count };
  });
}

/** Split spend + count between PROJECT and GENERAL scope. */
export function splitByScope(rows: ApprovedExpenseRow[]): ScopeSplit {
  let project = 0;
  let general = 0;
  let projectCount = 0;
  let generalCount = 0;
  for (const r of rows) {
    if (r.scope === "GENERAL") {
      general += r.amount;
      generalCount += 1;
    } else {
      project += r.amount;
      projectCount += 1;
    }
  }
  return {
    project: round2(project),
    general: round2(general),
    projectCount,
    generalCount,
  };
}

// ── Projects analytics (Phase 3) ──────────────────────────────────────────────

export const NEAR_LIMIT_PCT = 80;
export const OVER_BUDGET_PCT = 100;

export interface ProjectLike {
  id: string;
  name: string;
  status: string;
  budget: number;
  archived: boolean;
}

/**
 * Compose per-project report rows from projects + approved-spend aggregates.
 * Projects without a budget (budget <= 0) get null remaining/utilization — never
 * a divide-by-zero or a misleading 0%. Sorted by spend desc (ties: name).
 */
export function buildProjectRows(
  projects: ProjectLike[],
  spentByProject: Map<string, ProjectExpenseAgg>,
  currency = "INR",
): ProjectReportRow[] {
  return projects
    .map((p) => {
      const agg = spentByProject.get(p.id) ?? { amount: 0, count: 0 };
      const spent = round2(agg.amount);
      const hasBudget = p.budget > 0;
      return {
        projectId: p.id,
        projectName: p.name,
        status: p.status,
        archived: p.archived,
        budget: p.budget,
        hasBudget,
        totalSpent: spent,
        remaining: hasBudget ? round2(p.budget - spent) : null,
        utilization: hasBudget ? round2((spent / p.budget) * 100) : null,
        currency,
        expenseCount: agg.count,
      };
    })
    .sort(
      (a, b) =>
        b.totalSpent - a.totalSpent || a.projectName.localeCompare(b.projectName),
    );
}

/** Roll up totals across project rows for the Projects report header. */
export function summarizeProjects(
  rows: ProjectReportRow[],
): ProjectsReportTotals {
  let budget = 0;
  let spent = 0;
  let overBudgetCount = 0;
  let nearLimitCount = 0;
  for (const r of rows) {
    budget += r.budget;
    spent += r.totalSpent;
    if (r.utilization !== null) {
      if (r.utilization > OVER_BUDGET_PCT) overBudgetCount += 1;
      else if (r.utilization >= NEAR_LIMIT_PCT) nearLimitCount += 1;
    }
  }
  return {
    projectCount: rows.length,
    budget: round2(budget),
    spent: round2(spent),
    remaining: round2(budget - spent),
    overBudgetCount,
    nearLimitCount,
  };
}

interface ProjectsReportTotals {
  projectCount: number;
  budget: number;
  spent: number;
  remaining: number;
  overBudgetCount: number;
  nearLimitCount: number;
}

// ── AI analytics (Phase 3) ────────────────────────────────────────────────────

const CONFIDENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0–59", min: 0, max: 59 },
  { label: "60–69", min: 60, max: 69 },
  { label: "70–79", min: 70, max: 79 },
  { label: "80–89", min: 80, max: 89 },
  { label: "90–100", min: 90, max: 100 },
];

function pct(numerator: number, denominator: number): number | null {
  return denominator > 0 ? round2((numerator / denominator) * 100) : null;
}

/**
 * Compute the AI-analytics report from analysis rows (read from Firestore by the
 * service). Pure for testability. `ref` drives the trailing monthly trend window.
 * Metrics that depend on newly-tracked fields (processingMs, tokensUsed) are null
 * until runs populate them — never fabricated.
 */
export function buildAiAnalytics(
  rows: AiAnalysisRow[],
  ref: Date,
  months = 12,
  creationMethods: Array<"AI" | "MANUAL" | undefined> = [],
): AiAnalyticsReport {
  const status: AiAnalyticsReport["statusBreakdown"] = {
    pending: 0,
    processing: 0,
    completed: 0,
    lowConfidence: 0,
    failed: 0,
  };
  const scores: number[] = [];
  const buckets = CONFIDENCE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  const providers = new Map<string, number>();
  const processingTimes: number[] = [];
  let tokenTotal = 0;
  let tokenCount = 0;
  let confirmed = 0;
  let corrected = 0;

  for (const r of rows) {
    switch (r.status) {
      case "PENDING": status.pending += 1; break;
      case "PROCESSING": status.processing += 1; break;
      case "COMPLETED": status.completed += 1; break;
      case "LOW_CONFIDENCE": status.lowConfidence += 1; break;
      case "FAILED": status.failed += 1; break;
    }
    if (typeof r.confidenceScore === "number") {
      scores.push(r.confidenceScore);
      const idx = CONFIDENCE_BUCKETS.findIndex(
        (b) => r.confidenceScore! >= b.min && r.confidenceScore! <= b.max,
      );
      if (idx >= 0) buckets[idx]!.count += 1;
    }
    const provider = r.provider ?? "unknown";
    providers.set(provider, (providers.get(provider) ?? 0) + 1);
    if (typeof r.processingMs === "number") processingTimes.push(r.processingMs);
    if (typeof r.tokensUsed === "number") {
      tokenTotal += r.tokensUsed;
      tokenCount += 1;
    }
    if (r.confirmed) {
      confirmed += 1;
      if (r.corrected) corrected += 1;
    }
  }

  const total = rows.length;
  const scored = status.completed + status.lowConfidence;
  const terminal = scored + status.failed;
  const avgConfidence =
    scores.length > 0
      ? round2(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const avgProcessingMs =
    processingTimes.length > 0
      ? Math.round(processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length)
      : null;

  const providerDistribution: ProviderCount[] = [...providers.entries()]
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count || a.provider.localeCompare(b.provider));

  const confidenceDistribution: ConfidenceBucket[] = buckets;

  // AI adoption (forward-only): creation-method split from the expenses side,
  // multi-document usage from the analysis rows.
  const aiCreated = creationMethods.filter((m) => m === "AI").length;
  const manualCreated = creationMethods.filter((m) => m === "MANUAL").length;
  const unknownCreated = creationMethods.filter((m) => m == null).length;
  const multiDocExpenses = rows.filter((r) => (r.documentCount ?? 1) > 1).length;
  const adoption = {
    aiCreated,
    manualCreated,
    unknownCreated,
    aiCreatedPct: pct(aiCreated, aiCreated + manualCreated),
    multiDocExpenses,
    multiDocPct: pct(multiDocExpenses, total),
  };

  // Low-confidence trend by createdAt month over the trailing window.
  const keys = monthKeys(ref, months);
  const trendMap = new Map(keys.map((k) => [k, { total: 0, lowConfidence: 0 }]));
  for (const r of rows) {
    const bucket = trendMap.get(r.createdAt.slice(0, 7));
    if (bucket) {
      bucket.total += 1;
      if (r.status === "LOW_CONFIDENCE") bucket.lowConfidence += 1;
    }
  }
  const lowConfidenceTrend = keys.map((k) => {
    const v = trendMap.get(k) ?? { total: 0, lowConfidence: 0 };
    return { month: k, total: v.total, lowConfidence: v.lowConfidence };
  });

  return {
    generatedAt: ref.toISOString(),
    totals: {
      total,
      completed: status.completed,
      lowConfidence: status.lowConfidence,
      failed: status.failed,
      averageConfidence: avgConfidence,
      lowConfidencePct: pct(status.lowConfidence, scored),
      successRate: pct(scored, terminal),
      confirmed,
      corrected,
      manualCorrectionRate: pct(corrected, confirmed),
      averageProcessingMs: avgProcessingMs,
    },
    statusBreakdown: status,
    confidenceDistribution,
    providerDistribution,
    corrections: {
      confirmed,
      corrected,
      unchanged: Math.max(0, confirmed - corrected),
    },
    lowConfidenceTrend,
    kimiUsage:
      tokenCount > 0
        ? {
            analysesWithTokens: tokenCount,
            totalTokens: tokenTotal,
            averageTokens: Math.round(tokenTotal / tokenCount),
          }
        : null,
    adoption,
  };
}
