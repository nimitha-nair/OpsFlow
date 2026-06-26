/** A count + summed amount for one slice of expenses. */
export interface StatusTotals {
  count: number;
  amount: number;
}

/** Per-currency count + summed amount (group-by-currency reporting). */
export interface CurrencyTotal {
  currency: string;
  count: number;
  amount: number;
}

/** Overview KPI block. DRAFT is excluded everywhere (private/unsubmitted). */
export interface OverviewKpis {
  /** All non-DRAFT expenses (approved + pending + rejected). */
  total: StatusTotals;
  /** APPROVED. */
  approved: StatusTotals;
  /** SUBMITTED + PENDING_REVIEW. */
  pending: StatusTotals;
  /** REJECTED. */
  rejected: StatusTotals;
}

export interface OverviewReport {
  generatedAt: string;
  /** The currency the KPIs are scoped to (the dominant or requested currency). */
  activeCurrency: string;
  /** Every currency present in range, so the UI can offer a breakdown/selector. */
  currencies: CurrencyTotal[];
  kpis: OverviewKpis;
}

/** Minimal approved-expense shape the pure grouping helpers operate on. */
export interface ApprovedExpenseRow {
  category: string;
  amount: number;
  scope: "PROJECT" | "GENERAL";
  expenseDate: string; // YYYY-MM-DD
}

export interface CategorySpend {
  category: string;
  amount: number;
  count: number;
}

export interface MonthlySpend {
  month: string; // YYYY-MM
  amount: number;
  count: number;
}

export interface ScopeSplit {
  project: number;
  general: number;
  projectCount: number;
  generalCount: number;
}

export interface ExpensesReport {
  range: { from: string | null; to: string | null };
  /** The currency the breakdowns below are scoped to. */
  activeCurrency: string;
  /** Every currency present among approved expenses in range. */
  currencies: CurrencyTotal[];
  spendByCategory: CategorySpend[];
  monthlyTrend: MonthlySpend[];
  byScope: ScopeSplit;
}

// ── Projects analytics ────────────────────────────────────────────────────────

/** Per-project approved-spend aggregate (used internally before composing rows). */
export interface ProjectExpenseAgg {
  amount: number;
  count: number;
}

export interface ProjectReportRow {
  projectId: string;
  projectName: string;
  status: string;
  archived: boolean;
  budget: number;
  hasBudget: boolean;
  totalSpent: number;
  /** null when the project has no budget. */
  remaining: number | null;
  /** Percent; null when the project has no budget. */
  utilization: number | null;
  currency: string;
  expenseCount: number;
}

export interface ProjectsReport {
  generatedAt: string;
  /** The currency project spend/budget figures are scoped to. */
  activeCurrency: string;
  /** Every currency present among approved expenses in range. */
  currencies: CurrencyTotal[];
  totals: {
    projectCount: number;
    budget: number;
    spent: number;
    remaining: number;
    overBudgetCount: number;
    nearLimitCount: number;
  };
  projects: ProjectReportRow[];
}

// ── AI analytics ──────────────────────────────────────────────────────────────

/** Minimal analysis row the pure AI-analytics helper operates on. */
export interface AiAnalysisRow {
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "LOW_CONFIDENCE";
  provider?: string;
  confidenceScore?: number;
  processingMs?: number;
  tokensUsed?: number;
  confirmed: boolean;
  corrected: boolean;
  createdAt: string; // ISO
  /** Number of documents analyzed (forward-only; absent rows count as 1). */
  documentCount?: number;
}

/** AI adoption metrics — how the AI-first flow is actually being used. */
export interface AiAdoption {
  aiCreated: number;
  manualCreated: number;
  unknownCreated: number;
  /** AI / (AI + MANUAL) as a percentage; null when none are known. */
  aiCreatedPct: number | null;
  multiDocExpenses: number;
  /** multi-doc analyses / total analyses; null when no analyses. */
  multiDocPct: number | null;
}

export interface AiStatusBreakdown {
  pending: number;
  processing: number;
  completed: number;
  lowConfidence: number;
  failed: number;
}

export interface ConfidenceBucket {
  label: string;
  count: number;
}

export interface ProviderCount {
  provider: string;
  count: number;
}

export interface AiMonthlyPoint {
  month: string;
  total: number;
  lowConfidence: number;
}

export interface AiAnalyticsReport {
  generatedAt: string;
  totals: {
    total: number;
    completed: number;
    lowConfidence: number;
    failed: number;
    averageConfidence: number | null;
    lowConfidencePct: number | null;
    successRate: number | null;
    confirmed: number;
    corrected: number;
    manualCorrectionRate: number | null;
    /** null when no run has recorded a duration yet (newly tracked). */
    averageProcessingMs: number | null;
  };
  statusBreakdown: AiStatusBreakdown;
  confidenceDistribution: ConfidenceBucket[];
  providerDistribution: ProviderCount[];
  corrections: { confirmed: number; corrected: number; unchanged: number };
  lowConfidenceTrend: AiMonthlyPoint[];
  /** null when no run has recorded token usage yet (Kimi-only, newly tracked). */
  kimiUsage: {
    analysesWithTokens: number;
    totalTokens: number;
    averageTokens: number;
  } | null;
  /** AI-first adoption metrics (forward-only). */
  adoption: AiAdoption;
}
