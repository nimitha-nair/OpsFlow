/**
 * Admin Reports — an executive BI workspace that replaces the old segmented
 * tabs with a sticky section rail + dashboard scroll. Each section carries its
 * own CSV/PDF export; the header carries the global Full-Report and Executive
 * Summary PDF actions.
 *
 * Sections that already had rich, proven implementations (Expense Analytics,
 * AI Extraction Accuracy) are reused as-is inside the new frame; the Executive
 * Overview, Department, Employee, Reimbursement, and Audit sections are built
 * here from real records (overview + projects reports joined with the expense
 * lifecycle list and the user directory — no fabricated numbers).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DateBasisToggle } from "../common/DateBasisToggle";
import { DateRangeFilter } from "../common/DateRangeFilter";
import { makeRange, rangeToParams, rangeSlug, type DateRange } from "../../lib/date-range";
import { ActiveRangeBadge } from "../common/ActiveRangeBadge";
import { MobileFiltersSheet } from "../mobile/MobileFiltersSheet";
import { MobileActionMenu, type MobileAction } from "../mobile/MobileActionMenu";
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { ExpensesTab } from "./ExpensesTab";
import { ProjectsTab } from "./ProjectsTab";
import { AiAnalyticsTab } from "./AiAnalyticsTab";
import { BarList, DonutChart } from "./charts";
import { CurrencyScope } from "./CurrencyScope";
import { PerCurrencySections } from "./PerCurrencySections";
import { ExpenseDetailTable } from "./ExpenseDetailTable";
import { MoneyTotals } from "../common/MoneyTotals";
import { formatCurrencyTotals, totalsByCurrency } from "../../lib/currency";
import { AreaTrend, DonutGauge, Heatmap, KpiCard, RankingList } from "./bi";
import { paletteAt } from "../common/accent";
import { formatDateTime, formatMoney } from "../../lib/format";
import { downloadCsv, printElement } from "../../lib/export";
import { getReportsOverview, getReportsProjects } from "../../lib/reports-api";
import { listReviewExpenses, listReimbursements } from "../../lib/expenses-api";
import { listUsers } from "../../lib/users-api";
import type { OverviewReport, ProjectsReport } from "../../types/reports";
import type { Expense } from "../../types/expense";
import type { User } from "../../types/user";
import {
  deriveAudit,
  deriveCategoryHeatmap,
  deriveDepartments,
  deriveEmployees,
  deriveProcessing,
  deriveReimbursements,
  deriveKpis,
  deriveMonthlyApproved,
  type DepartmentMetric,
} from "./workspace/derive";
import { SectionFrame } from "./workspace/shell";
import { type SectionDef } from "./workspace/report-sections";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* ----------------------------- shared bits ----------------------------- */

const compactMoney = (v: number, currency = "INR") => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v);
  } catch {
    return `${currency} ${Math.round(v)}`;
  }
};

const pct = (n: number) => `${Math.round(n)}%`;

const TABS: SectionDef[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "expense", label: "Expenses", icon: Wallet },
  { id: "projects", label: "Project Spending", icon: FolderKanban },
  { id: "department", label: "Departments", icon: Building2 },
  { id: "employee", label: "Employees", icon: Users },
  { id: "reimbursement", label: "Reimbursements", icon: Banknote },
  { id: "ai", label: "AI Analytics", icon: Sparkles },
  { id: "audit", label: "Audit & Compliance", icon: ShieldCheck },
];

/* ------------------------------- workspace ------------------------------ */

interface LoadedData {
  overview: OverviewReport;
  projects: ProjectsReport | null;
  records: Expense[];
  reimbursementRecords: Expense[];
  users: User[];
}

/** Re-scope a projects report to a single currency (spend/utilization for that
 *  currency only — never combined across currencies). */
function scopeProjectsTo(report: ProjectsReport, currency: string): ProjectsReport {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const projects = report.projects.map((p) => {
    const cur = p.spentByCurrency.find((t) => t.currency === currency);
    const totalSpent = r2(cur?.amount ?? 0);
    return {
      ...p,
      totalSpent,
      spentByCurrency: cur ? [cur] : [],
      remaining: p.hasBudget ? r2(p.budget - totalSpent) : null,
      utilization: p.hasBudget ? r2((totalSpent / p.budget) * 100) : null,
      currency,
    };
  });
  const spent = r2(projects.reduce((s, p) => s + p.totalSpent, 0));
  const curTotal = report.totals.spentByCurrency.find((t) => t.currency === currency);
  return {
    ...report,
    activeCurrency: currency,
    totals: {
      ...report.totals,
      spent,
      spentByCurrency: curTotal ? [curTotal] : [],
      remaining: r2(report.totals.budget - spent),
    },
    projects,
  };
}

export function ReportsWorkspace() {
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">("expenseDate");
  // Multi-currency: which currencies to render. `null` = default (all present);
  // an array = the user's explicit pick. One → today's layout; several → one
  // section per currency (never combined).
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[] | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // The active tab is driven by ?tab= so it can be deep-linked (e.g. the
  // Projects page links straight to Project Spending).
  const tabParam = searchParams.get("tab");
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam! : "overview";
  const changeTab = (next: string) =>
    setSearchParams(
      (prev) => {
        prev.set("tab", next);
        return prev;
      },
      { replace: true },
    );
  const panelsRef = useRef<HTMLDivElement>(null);

  const panelNode = (id: string) =>
    panelsRef.current?.querySelector<HTMLElement>(`[data-panel="${id}"]`) ?? null;
  const revealAll = (clone: HTMLElement) =>
    clone.querySelectorAll(".report-panel").forEach((p) => p.classList.remove("hidden"));
  const reveal = (clone: HTMLElement) => clone.classList.remove("hidden");

  const exportCurrentTab = () => printElement(panelNode(tab), `opsflow-${tab}-report`, reveal);
  const exportSummary = () => printElement(panelNode("overview"), "opsflow-executive-summary", reveal);
  const exportAll = () => printElement(panelsRef.current, "opsflow-full-report", revealAll);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const params = { ...rangeToParams(range), basis };
    const [overview, records, usersResp, projects, reimbursementRecords] = await Promise.all([
      getReportsOverview(params),
      // Everything is fetched across all currencies; the report sections scope
      // client-side per selected currency (the projects report already carries a
      // per-currency breakdown), so switching currencies needs no refetch.
      listReviewExpenses("ALL", params),
      listUsers({ limit: 1000 }),
      getReportsProjects(params).catch(() => null),
      listReimbursements(rangeToParams(range)),
    ]);
    if (signal?.cancelled) return;
    setData({ overview, projects, records, reimbursementRecords, users: usersResp.data });
    setError(null);
  }, [range, basis]);

  useEffect(() => {
    const signal = { cancelled: false };
    void (async () => {
      try {
        await load(signal);
      } catch {
        if (!signal.cancelled) setError("We couldn't load the reports. Please try again.");
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load()
      .catch(() => setError("We couldn't refresh the reports. Please try again."))
      .finally(() => setRefreshing(false));
  };

  // Currencies present across the (date-scoped) lifecycle records, and the active
  // one the picker/derivations scope to. Records are filtered client-side so
  // every derived KPI/chart/total honors the selected currency.
  const currencyTotals = useMemo(
    () => (data ? totalsByCurrency(data.records) : []),
    [data],
  );
  // employeeId → name, for the print-only per-expense detail listing.
  const userNameMap = useMemo(
    () => new Map((data?.users ?? []).map((u) => [u.id, u.name] as const)),
    [data],
  );
  // Currencies to render: the user's valid picks, else INR by default (falling
  // back to the dominant currency when there's no INR).
  const allCurrencies = currencyTotals.map((t) => t.currency);
  const defaultCurrencies = allCurrencies.includes("INR")
    ? ["INR"]
    : allCurrencies.slice(0, 1);
  const picked = selectedCurrencies?.filter((c) => allCurrencies.includes(c)) ?? null;
  const renderCurrencies = picked && picked.length > 0 ? picked : defaultCurrencies;

  // A per-currency slice of the loaded data: records/reimbursements filtered and
  // the projects report re-scoped to that currency (never combined).
  const scopedFor = (c: string): LoadedData => {
    const match = (r: Expense) => (r.currency || "INR").toUpperCase() === c;
    return {
      ...data!,
      records: data!.records.filter(match),
      reimbursementRecords: data!.reimbursementRecords.filter(match),
      projects: data!.projects ? scopeProjectsTo(data!.projects, c) : null,
    };
  };

  const currencyScope =
    currencyTotals.length > 0 ? (
      <CurrencyScope
        totals={currencyTotals}
        selected={renderCurrencies}
        onChange={setSelectedCurrencies}
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Executive expense intelligence across the organization."
        breadcrumbs={[{ label: "Reports" }]}
        actions={
          <>
            {/* Desktop / tablet toolbar (unchanged) */}
            <div className="no-print hidden flex-wrap items-center gap-2 md:flex">
              <ActiveRangeBadge
                range={range}
                basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
              />
              <DateBasisToggle value={basis} onChange={setBasis} />
              <DateRangeFilter value={range} onChange={setRange} />
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCurrentTab}>
                <FileText className="size-4" />
                This tab
              </Button>
              <Button variant="outline" size="sm" onClick={exportSummary}>
                Summary
              </Button>
              <Button size="sm" onClick={exportAll}>
                <Download className="size-4" />
                Export all
              </Button>
            </div>

            {/* Mobile: Filters bottom sheet + actions overflow menu */}
            <div className="no-print flex items-center gap-2 md:hidden">
              <ActiveRangeBadge
                range={range}
                basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
              />
              <MobileFiltersSheet
                activeCount={range.preset !== "all" ? 1 : 0}
                onClear={() => setRange(makeRange("all"))}
                className="shrink-0"
              >
                <ReportFilterField label="Date basis">
                  <DateBasisToggle value={basis} onChange={setBasis} />
                </ReportFilterField>
                <ReportFilterField label="Date range">
                  <DateRangeFilter value={range} onChange={setRange} />
                </ReportFilterField>
              </MobileFiltersSheet>
              <MobileActionMenu
                className="shrink-0"
                actions={[
                  {
                    label: refreshing ? "Refreshing…" : "Refresh",
                    icon: <RefreshCw className="size-4" />,
                    onSelect: onRefresh,
                    disabled: refreshing,
                  },
                  {
                    label: "Export this tab",
                    icon: <FileText className="size-4" />,
                    onSelect: exportCurrentTab,
                  },
                  {
                    label: "Export summary",
                    icon: <FileText className="size-4" />,
                    onSelect: exportSummary,
                  },
                  {
                    label: "Export all",
                    icon: <Download className="size-4" />,
                    onSelect: exportAll,
                  },
                ] satisfies MobileAction[]}
              />
            </div>
          </>
        }
      />

      {loading ? (
        <LoadingState label="Loading reports…" />
      ) : error || !data ? (
        <ErrorState
          title="Couldn't load reports"
          description={
            error ??
            "We couldn't load report data. Please retry, or check back once there's activity to report on."
          }
          onRetry={onRefresh}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <Tabs value={tab} onValueChange={(v) => changeTab(v as string)}>
            <TabsList variant="line" className="no-print w-full justify-start overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.id} value={t.id}>
                    <Icon className="size-4" />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          {/* Group-by-currency picker / breakdown (only when there's data). */}
          {currencyScope && <div className="no-print -mt-2">{currencyScope}</div>}

          {/* All panels are mounted; only the active one is visible. Hidden
              panels are revealed in the clone for the "Export all" PDF. */}
          <div ref={panelsRef} className="flex min-w-0 flex-col">
            <p className="mb-4 hidden text-xs text-muted-foreground print:block">
              OpsFlow — generated {formatDateTime(data.overview.generatedAt)} ·{" "}
              {renderCurrencies.join(", ")}
            </p>
            <Panel id="overview" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => {
                  const sd = scopedFor(c);
                  return (
                    <ExecutiveOverview
                      data={sd}
                      allRecords={sd.records}
                      currency={c}
                      slug={rangeSlug(range)}
                      onOpenProjects={() => changeTab("projects")}
                    />
                  );
                }}
              </PerCurrencySections>
            </Panel>
            <Panel id="expense" active={tab}>
              <SectionFrame
                id="expense"
                title="Expense Analytics"
                description="Category mix, scope split, and monthly spend trend."
              >
                <PerCurrencySections currencies={renderCurrencies}>
                  {(c) => <ExpensesTab currency={c} />}
                </PerCurrencySections>
                {/* Print-only: every expense by currency, included in tab + full prints. */}
                <ExpenseDetailTable
                  expenses={data.records}
                  scope="admin"
                  employeeNames={userNameMap}
                />
              </SectionFrame>
            </Panel>
            <Panel id="projects" active={tab}>
              <SectionFrame
                id="projects"
                title="Project Spending"
                description="Approved spend against each project's budget and utilization."
              >
                <PerCurrencySections currencies={renderCurrencies}>
                  {(c) => <ProjectsTab currency={c} />}
                </PerCurrencySections>
              </SectionFrame>
            </Panel>
            <Panel id="department" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => (
                  <DepartmentAnalytics data={scopedFor(c)} currency={c} slug={rangeSlug(range)} />
                )}
              </PerCurrencySections>
            </Panel>
            <Panel id="employee" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => (
                  <EmployeeAnalytics data={scopedFor(c)} currency={c} slug={rangeSlug(range)} />
                )}
              </PerCurrencySections>
            </Panel>
            <Panel id="reimbursement" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => (
                  <ReimbursementAnalytics data={scopedFor(c)} currency={c} slug={rangeSlug(range)} />
                )}
              </PerCurrencySections>
            </Panel>
            {/* AI extraction metrics are about the engine, not money → shown once. */}
            <Panel id="ai" active={tab}>
              <SectionFrame
                id="ai"
                title="AI Extraction Accuracy"
                description="Receipt extraction confidence, corrections, and provider performance."
              >
                <AiAnalyticsTab />
              </SectionFrame>
            </Panel>
            <Panel id="audit" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => (
                  <AuditCompliance data={scopedFor(c)} currency={c} slug={rangeSlug(range)} />
                )}
              </PerCurrencySections>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

/** Labelled, full-width control wrapper used inside the mobile Filters sheet. */
function ReportFilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A tab panel: mounted always, hidden unless active (revealed in PDF clones). */
function Panel({
  id,
  active,
  children,
}: {
  id: string;
  active: string;
  children: ReactNode;
}) {
  return (
    <div data-panel={id} className={cn("report-panel", active !== id && "hidden")}>
      {children}
    </div>
  );
}

/* ----------------------------- Executive ------------------------------- */

function ExecutiveOverview({
  data,
  allRecords,
  currency,
  slug,
  onOpenProjects,
}: {
  data: LoadedData;
  /** Full (all-currency) records — counts + grouped money come from these. */
  allRecords: Expense[];
  currency: string;
  slug: string;
  onOpenProjects: () => void;
}) {
  const { projects, records, users } = data;
  // Counts come from the full record set (currency-agnostic); money is grouped
  // per currency (never summed across). The scoped `records` drive the charts.
  const k = useMemo(() => deriveKpis(allRecords), [allRecords]);
  const approvedByCurrency = useMemo(
    () => totalsByCurrency(allRecords.filter((r) => r.approvalStatus === "APPROVED")),
    [allRecords],
  );
  const pendingByCurrency = useMemo(
    () =>
      totalsByCurrency(
        allRecords.filter(
          (r) =>
            r.approvalStatus === "SUBMITTED" ||
            r.approvalStatus === "PENDING_REVIEW",
        ),
      ),
    [allRecords],
  );
  const rejectedByCurrency = useMemo(
    () => totalsByCurrency(allRecords.filter((r) => r.approvalStatus === "REJECTED")),
    [allRecords],
  );
  const decided = k.approved.count + k.rejected.count;
  const approvalRate = decided > 0 ? (k.approved.count / decided) * 100 : 0;

  const processing = useMemo(() => deriveProcessing(records), [records]);
  const departments = useMemo(
    () => deriveDepartments(records, users).filter((d) => d.totalSpend > 0),
    [records, users],
  );

  const monthly = useMemo(() => deriveMonthlyApproved(records, 12), [records]);
  const trend = monthly.map((m) => ({ label: m.label, value: m.amount }));
  const lastTwo = monthly.slice(-2);
  const momDelta =
    lastTwo.length === 2 && lastTwo[0]!.amount > 0
      ? ((lastTwo[1]!.amount - lastTwo[0]!.amount) / lastTwo[0]!.amount) * 100
      : null;

  const budgetAtRisk = projects?.totals.overBudgetCount ?? 0;

  return (
    <SectionFrame
      id="overview"
      title="Executive Overview"
      description="The numbers leadership checks first — spend, throughput, and risk."
      onCsv={() =>
        // Per-currency rows — exports never combine currencies into one total.
        downloadCsv(
          `opsflow-executive-overview_${slug}`,
          [
            { metric: "Approved spend", totals: approvedByCurrency },
            { metric: "Pending review", totals: pendingByCurrency },
            { metric: "Rejected", totals: rejectedByCurrency },
          ].flatMap(({ metric, totals }) =>
            (totals.length > 0 ? totals : [{ currency, amount: 0, count: 0 }]).map(
              (t) => ({ metric, currency: t.currency, value: t.amount, count: t.count }),
            ),
          ),
          [
            { label: "Metric", value: (r) => r.metric },
            { label: "Currency", value: (r) => r.currency },
            { label: "Amount", value: (r) => r.value },
            { label: "Count", value: (r) => r.count },
          ],
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="indigo"
          icon={Wallet}
          label="Approved spend"
          value={<MoneyTotals totals={approvedByCurrency} compact />}
          hint={`${k.approved.count} approved of ${k.total.count} submitted`}
          trend={momDelta}
          spark={monthly.slice(-8).map((m) => m.amount)}
        />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Approval rate"
          value={pct(approvalRate)}
          hint={`${k.approved.count} approved · ${k.rejected.count} rejected`}
        />
        <KpiCard
          index={2}
          accent="amber"
          icon={Timer}
          label="Avg processing time"
          value={processing.avgDays === null ? "—" : `${processing.avgDays.toFixed(1)}d`}
          hint={
            processing.reviewedCount > 0
              ? `${processing.reviewedCount} reviewed · median ${processing.medianDays?.toFixed(1)}d`
              : "No reviewed expenses yet"
          }
        />
        <KpiCard
          index={3}
          accent="rose"
          icon={AlertTriangle}
          label="Pending approval risk"
          value={k.pending.count}
          hint={`${formatCurrencyTotals(pendingByCurrency, compactMoney)} awaiting · ${budgetAtRisk} project(s) over budget`}
          invertTrend
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard
          title="Monthly spend trend"
          description="Approved expense value over time"
          className="lg:col-span-2"
        >
          <AreaTrend
            data={trend}
            accent="indigo"
            format={(v) => formatMoney(v, currency)}
          />
        </SectionCard>
        <SectionCard title="Approval rate" description="Share of reviewed expenses approved">
          <div className="flex flex-col items-center gap-4 py-2">
            <DonutGauge
              value={approvalRate}
              accent={approvalRate >= 80 ? "emerald" : approvalRate >= 60 ? "amber" : "rose"}
              centerLabel="approved"
              centerSub={`${decided} reviewed`}
            />
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-emerald-500/10 px-3 py-2">
                <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {k.approved.count}
                </div>
                <div className="text-xs text-muted-foreground">Approved</div>
              </div>
              <div className="rounded-lg bg-rose-500/10 px-3 py-2">
                <div className="text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  {k.rejected.count}
                </div>
                <div className="text-xs text-muted-foreground">Rejected</div>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Department spend comparison"
        description="Top departments by approved spend"
      >
        {departments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved spend yet.</p>
        ) : (
          <RankingList
            accent="violet"
            items={departments.slice(0, 6).map((d) => ({
              label: d.name,
              valueText: compactMoney(d.totalSpend, currency),
              ratio: d.totalSpend / (departments[0]?.totalSpend || 1),
              sub: `${d.headcount} people · ${pct(d.shareOfSpend * 100)} of spend`,
            }))}
          />
        )}
      </SectionCard>

      {projects && (
        <SectionCard
          title="Project spending"
          description="Approved spend against project budgets"
          actions={
            <button
              type="button"
              onClick={onOpenProjects}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View details <ArrowRight className="size-3" />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            <KpiCard index={0} accent="indigo" icon={FolderKanban} label="Projects" value={projects.totals.projectCount} />
            <KpiCard
              index={1}
              accent="sky"
              icon={Wallet}
              label="Total budget"
              value={compactMoney(projects.totals.budget, currency)}
            />
            <KpiCard
              index={2}
              accent="violet"
              icon={TrendingUp}
              label="Approved spend"
              value={<MoneyTotals totals={projects.totals.spentByCurrency} compact />}
              hint={`${compactMoney(projects.totals.remaining, currency)} remaining vs budget`}
            />
            <KpiCard
              index={3}
              accent="amber"
              icon={AlertTriangle}
              label="Over / near budget"
              value={`${projects.totals.overBudgetCount} / ${projects.totals.nearLimitCount}`}
              hint=">100% / ≥80% utilization"
              invertTrend
            />
          </div>
        </SectionCard>
      )}
    </SectionFrame>
  );
}

/* --------------------------- Department -------------------------------- */

function DepartmentAnalytics({ data, currency, slug }: { data: LoadedData; currency: string; slug: string }) {
  const { records, users } = data;
  const departments = useMemo(() => deriveDepartments(records, users), [records, users]);
  const withSpend = departments.filter((d) => d.totalSpend > 0 || d.headcount > 0);
  const heatmap = useMemo(
    () =>
      deriveCategoryHeatmap(
        records,
        users,
        departments.slice(0, 6).map((d) => d.name),
      ),
    [records, users, departments],
  );

  return (
    <SectionFrame
      id="department"
      title="Department Analytics"
      description="Spend, headcount, throughput, and risk by department."
      onCsv={() =>
        downloadCsv(`opsflow-department-analytics_${slug}`, withSpend, [
          { label: "Department", value: (d) => d.name },
          { label: "Headcount", value: (d) => d.headcount },
          { label: "Active", value: (d) => d.activeHeadcount },
          { label: "Approved spend", value: (d) => d.totalSpend },
          { label: "Expenses", value: (d) => d.expenseCount },
          { label: "Pending", value: (d) => d.pendingCount },
          { label: "Reimb. outstanding", value: (d) => d.reimbursementPending },
          { label: "Avg processing days", value: (d) => d.avgProcessingDays?.toFixed(2) ?? "" },
          { label: "Risk", value: (d) => d.risk.toFixed(2) },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} accent="violet" icon={Building2} label="Departments" value={withSpend.length} />
        <KpiCard
          index={1}
          accent="indigo"
          icon={Users}
          label="People tracked"
          value={users.length}
          hint={`${users.filter((u) => u.isActive).length} active`}
        />
        <KpiCard
          index={2}
          accent="amber"
          icon={Receipt}
          label="Top dept share"
          value={withSpend[0] ? pct(withSpend[0].shareOfSpend * 100) : "—"}
          hint={withSpend[0]?.name}
        />
        <KpiCard
          index={3}
          accent="rose"
          icon={AlertTriangle}
          label="Highest risk dept"
          value={
            [...withSpend].sort((a, b) => b.risk - a.risk)[0]
              ? pct(([...withSpend].sort((a, b) => b.risk - a.risk)[0]!.risk) * 100)
              : "—"
          }
          hint={[...withSpend].sort((a, b) => b.risk - a.risk)[0]?.name}
          invertTrend
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Approved spend by department" description="Relative contribution">
          <BarList
            items={withSpend
              .filter((d) => d.totalSpend > 0)
              .slice(0, 8)
              .map((d, i) => ({
                label: d.name,
                valueText: compactMoney(d.totalSpend, currency),
                ratio: d.totalSpend / (withSpend[0]?.totalSpend || 1),
                tone: paletteAt(i),
              }))}
          />
        </SectionCard>
        <SectionCard title="Spend distribution" description="Department × category heatmap">
          {heatmap.yLabels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <Heatmap
              accent="indigo"
              xLabels={heatmap.xLabels}
              yLabels={heatmap.yLabels}
              matrix={heatmap.matrix}
              format={(v) => compactMoney(v, currency)}
            />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Department performance" description="Drill-down across every department">
        <DepartmentTable rows={withSpend} currency={currency} />
      </SectionCard>
    </SectionFrame>
  );
}

function DepartmentTable({ rows, currency }: { rows: DepartmentMetric[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Head count</TableHead>
            <TableHead className="text-right">Approved spend</TableHead>
            <TableHead className="text-right">Pending</TableHead>
            <TableHead className="text-right">Reimb. due</TableHead>
            <TableHead className="text-right">Avg turnaround</TableHead>
            <TableHead className="text-right">Risk</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((d) => (
            <TableRow key={d.name}>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-right tabular-nums">
                {d.activeHeadcount}/{d.headcount}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(d.totalSpend, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">{d.pendingCount}</TableCell>
              <TableCell className="text-right tabular-nums">
                {compactMoney(d.reimbursementPending, currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {d.avgProcessingDays === null ? "—" : `${d.avgProcessingDays.toFixed(1)}d`}
              </TableCell>
              <TableCell className="text-right">
                <RiskBadge risk={d.risk} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RiskBadge({ risk }: { risk: number }) {
  const level = risk >= 0.5 ? "high" : risk >= 0.25 ? "med" : "low";
  const cls =
    level === "high"
      ? "bg-rose-500/12 text-rose-600 dark:text-rose-400"
      : level === "med"
        ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400";
  const label = level === "high" ? "High" : level === "med" ? "Watch" : "Low";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

/* ---------------------------- Employee --------------------------------- */

function EmployeeAnalytics({ data, currency, slug }: { data: LoadedData; currency: string; slug: string }) {
  const { records, users } = data;
  const employees = useMemo(() => deriveEmployees(records, users), [records, users]);
  const spenders = employees.filter((e) => e.totalSpend > 0);
  const topRejected = [...employees].sort((a, b) => b.rejectedCount - a.rejectedCount)[0];

  return (
    <SectionFrame
      id="employee"
      title="Employee Analytics"
      description="Who is spending, how much, and how clean their submissions are."
      onCsv={() =>
        downloadCsv(`opsflow-employee-analytics_${slug}`, spenders, [
          { label: "Employee", value: (e) => e.name },
          { label: "Department", value: (e) => e.department },
          { label: "Approved spend", value: (e) => e.totalSpend },
          { label: "Submitted", value: (e) => e.submittedCount },
          { label: "Approved", value: (e) => e.approvedCount },
          { label: "Rejected", value: (e) => e.rejectedCount },
          { label: "Manual entries", value: (e) => e.manualCount },
          { label: "Avg amount", value: (e) => e.avgAmount.toFixed(2) },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} accent="indigo" icon={Users} label="Active submitters" value={spenders.length} />
        <KpiCard
          index={1}
          accent="emerald"
          icon={TrendingUp}
          label="Top spender"
          value={spenders[0] ? compactMoney(spenders[0].totalSpend, currency) : "—"}
          hint={spenders[0]?.name}
        />
        <KpiCard
          index={2}
          accent="amber"
          icon={Receipt}
          label="Avg per approved"
          value={
            spenders.length
              ? compactMoney(
                  spenders.reduce((s, e) => s + e.totalSpend, 0) /
                    Math.max(1, spenders.reduce((s, e) => s + e.approvedCount, 0)),
                  currency,
                )
              : "—"
          }
        />
        <KpiCard
          index={3}
          accent="rose"
          icon={XCircle}
          label="Most rejections"
          value={topRejected?.rejectedCount ?? 0}
          hint={topRejected?.rejectedCount ? topRejected.name : "None"}
          invertTrend
        />
      </div>

      <SectionCard title="Top employees by spend" description="Approved spend, ranked">
        <RankingList
          accent="emerald"
          items={spenders.slice(0, 8).map((e) => ({
            label: e.name,
            valueText: compactMoney(e.totalSpend, currency),
            ratio: e.totalSpend / (spenders[0]?.totalSpend || 1),
            sub: `${e.department} · ${e.approvedCount} approved`,
          }))}
        />
      </SectionCard>

      <SectionCard title="Employee breakdown" description="Full submission record">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Approved spend</TableHead>
                <TableHead className="text-right">Submitted</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead className="text-right">Manual</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spenders.slice(0, 25).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.department}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(e.totalSpend, currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{e.submittedCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.approvedCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.rejectedCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{e.manualCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </SectionFrame>
  );
}

/* -------------------------- Reimbursement ------------------------------ */

function ReimbursementAnalytics({ data, currency, slug }: { data: LoadedData; currency: string; slug: string }) {
  const { reimbursementRecords, users } = data;
  const model = useMemo(() => deriveReimbursements(reimbursementRecords, users), [reimbursementRecords, users]);

  return (
    <SectionFrame
      id="reimbursement"
      title="Reimbursement Analytics"
      description="Outstanding payouts and how they are distributed."
      onCsv={() =>
        downloadCsv(`opsflow-reimbursement_${slug}`, model.byDepartment, [
          { label: "Department", value: (d) => d.name },
          { label: "Outstanding", value: (d) => d.outstanding },
          { label: "Paid", value: (d) => d.paid },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="amber"
          icon={Banknote}
          label="Outstanding payouts"
          value={compactMoney(model.pendingAmount, currency)}
          hint={`${model.outstandingCount} approved expenses unpaid`}
        />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Paid out"
          value={compactMoney(model.paidAmount, currency)}
          hint={`${model.byStatus.PAID.count} reimbursed`}
        />
        <KpiCard
          index={2}
          accent="sky"
          icon={Clock}
          label="Processing"
          value={model.byStatus.PROCESSING.count}
          hint={compactMoney(model.byStatus.PROCESSING.amount, currency)}
        />
        <KpiCard
          index={3}
          accent="rose"
          icon={Gauge}
          label="Pending"
          value={model.byStatus.PENDING.count}
          hint={compactMoney(model.byStatus.PENDING.amount, currency)}
          invertTrend
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Status mix" description="Approved expenses by reimbursement status">
          <DonutChart
            segments={[
              { label: "Pending", value: model.byStatus.PENDING.amount, accent: "rose" },
              { label: "Processing", value: model.byStatus.PROCESSING.amount, accent: "sky" },
              { label: "Paid", value: model.byStatus.PAID.amount, accent: "emerald" },
            ]}
            centerValue={compactMoney(
              model.byStatus.PENDING.amount +
                model.byStatus.PROCESSING.amount +
                model.byStatus.PAID.amount,
              currency,
            )}
            centerLabel="approved"
            formatValue={(v) => compactMoney(v, currency)}
            emptyLabel="No approved expenses to reimburse yet."
          />
        </SectionCard>
        <SectionCard title="Outstanding by department" description="Where payouts are owed">
          {model.byDepartment.filter((d) => d.outstanding > 0).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
          ) : (
            <RankingList
              accent="amber"
              items={model.byDepartment
                .filter((d) => d.outstanding > 0)
                .slice(0, 6)
                .map((d) => ({
                  label: d.name,
                  valueText: compactMoney(d.outstanding, currency),
                  ratio: d.outstanding / (model.byDepartment[0]?.outstanding || 1),
                }))}
            />
          )}
        </SectionCard>
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Audit ----------------------------------- */

function AuditCompliance({ data, currency, slug }: { data: LoadedData; currency: string; slug: string }) {
  const { records, users } = data;
  const audit = useMemo(() => deriveAudit(records, users), [records, users]);
  const processing = useMemo(() => deriveProcessing(records), [records]);

  return (
    <SectionFrame
      id="audit"
      title="Audit & Compliance"
      description="Policy signals: manual entries, missing documents, and high-value flags."
      onCsv={() =>
        downloadCsv(`opsflow-audit-flags_${slug}`, audit.flags, [
          { label: "Employee", value: (f) => f.employee },
          { label: "Department", value: (f) => f.department },
          { label: "Reason", value: (f) => f.reason },
          { label: "Severity", value: (f) => f.severity },
          { label: "Amount", value: (f) => f.amount },
          { label: "Date", value: (f) => f.date },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          accent="amber"
          icon={Receipt}
          label="Manual-entry rate"
          value={audit.manualPct === null ? "—" : pct(audit.manualPct)}
          hint={`${audit.manualCount} entries without a receipt`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="rose"
          icon={AlertTriangle}
          label="Missing documentation"
          value={audit.missingDocCount}
          hint="expenses with no attached document"
          invertTrend
        />
        <KpiCard
          index={2}
          accent="violet"
          icon={ShieldCheck}
          label="High-value flags"
          value={audit.flags.length}
          hint={`≥ ${compactMoney(audit.highValueThreshold, currency)} threshold`}
          invertTrend
        />
        <KpiCard
          index={3}
          accent="sky"
          icon={Timer}
          label="Median turnaround"
          value={processing.medianDays === null ? "—" : `${processing.medianDays.toFixed(1)}d`}
          hint={`${processing.reviewedCount} reviewed`}
        />
      </div>

      <SectionCard title="Turnaround distribution" description="How quickly expenses are reviewed">
        {processing.buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviewed expenses yet.</p>
        ) : (
          <BarList
            items={processing.buckets.map((b, i) => ({
              label: b.label,
              valueText: String(b.count),
              ratio: b.count / Math.max(1, ...processing.buckets.map((x) => x.count)),
              tone: paletteAt(i),
            }))}
          />
        )}
      </SectionCard>

      <SectionCard title="Flagged submissions" description="Prioritized review queue">
        {audit.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy flags. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.employee}</TableCell>
                    <TableCell className="text-muted-foreground">{f.department}</TableCell>
                    <TableCell>{f.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(f.amount, currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.severity === "high" ? "destructive" : "secondary"}>
                        {f.severity === "high" ? "High" : "Medium"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </SectionFrame>
  );
}
