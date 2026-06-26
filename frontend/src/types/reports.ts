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

export interface OverviewKpis {
  total: StatusTotals;
  approved: StatusTotals;
  pending: StatusTotals;
  rejected: StatusTotals;
}

export interface OverviewReport {
  generatedAt: string;
  /** Currency the KPIs are scoped to (dominant or requested). */
  activeCurrency: string;
  /** Every currency present in range. */
  currencies: CurrencyTotal[];
  kpis: OverviewKpis;
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
  range: { from: string; to: string; months: number };
  /** Currency the breakdowns are scoped to. */
  activeCurrency: string;
  /** Every currency present among approved expenses in range. */
  currencies: CurrencyTotal[];
  spendByCategory: CategorySpend[];
  monthlyTrend: MonthlySpend[];
  byScope: ScopeSplit;
}

export interface ProjectReportRow {
  projectId: string;
  projectName: string;
  status: string;
  archived: boolean;
  budget: number;
  hasBudget: boolean;
  /** Spend in the primary (budget) currency — drives utilization/remaining. */
  totalSpent: number;
  /** Full per-currency spend on the project; never combined into one number. */
  spentByCurrency: CurrencyTotal[];
  remaining: number | null;
  utilization: number | null;
  /** The primary (budget) currency utilization is measured in. */
  currency: string;
  expenseCount: number;
}

export interface ProjectsReport {
  generatedAt: string;
  /** Currency project spend/budget figures are scoped to. */
  activeCurrency: string;
  /** Every currency present among approved expenses in range. */
  currencies: CurrencyTotal[];
  totals: {
    projectCount: number;
    budget: number;
    spent: number;
    /** Full per-currency spend across all projects; never combined. */
    spentByCurrency: CurrencyTotal[];
    remaining: number;
    overBudgetCount: number;
    nearLimitCount: number;
  };
  projects: ProjectReportRow[];
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
    averageProcessingMs: number | null;
  };
  statusBreakdown: AiStatusBreakdown;
  confidenceDistribution: ConfidenceBucket[];
  providerDistribution: ProviderCount[];
  corrections: { confirmed: number; corrected: number; unchanged: number };
  lowConfidenceTrend: AiMonthlyPoint[];
  kimiUsage: {
    analysesWithTokens: number;
    totalTokens: number;
    averageTokens: number;
  } | null;
  /** AI-first adoption metrics (optional — tolerate older backends). */
  adoption?: AiAdoption;
}

/** AI adoption metrics — how the AI-first flow is actually being used. */
export interface AiAdoption {
  aiCreated: number;
  manualCreated: number;
  unknownCreated: number;
  aiCreatedPct: number | null;
  multiDocExpenses: number;
  multiDocPct: number | null;
}
