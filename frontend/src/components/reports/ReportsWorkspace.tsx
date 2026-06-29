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
import { ExpensesAnalytics } from "./ExpensesTab";
import { ProjectsAnalytics } from "./ProjectsTab";
import { AiAnalyticsTab } from "./AiAnalyticsTab";
import { BarList, CurrencyLegend, CurrencyMultiples, DonutChart } from "./charts";
import { CurrencyScope } from "./CurrencyScope";
import { ExpenseDetailTable } from "./ExpenseDetailTable";
import { MoneyTotals } from "../common/MoneyTotals";
import { formatCurrencyTotals, totalsByCurrency } from "../../lib/currency";
import { AreaTrend, DonutGauge, Heatmap, KpiCard, RankingList } from "./bi";
import { currencyGradient, paletteAt } from "../common/accent";
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
            {/* Desktop / tablet toolbar: filters on the left, actions on the
                right, separated by a divider so the two zones read clearly. */}
            <div className="no-print hidden flex-wrap items-center gap-2 md:flex">
              {/* Filters */}
              <ActiveRangeBadge
                range={range}
                basisLabel={basis === "submittedAt" ? "Submitted" : "Expense date"}
              />
              <DateBasisToggle value={basis} onChange={setBasis} />
              <DateRangeFilter value={range} onChange={setRange} />
              <div className="mx-0.5 h-6 w-px self-center bg-border" aria-hidden />
              {/* Actions */}
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
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
              <ExecutiveOverview
                data={data}
                currencies={renderCurrencies}
                slug={rangeSlug(range)}
                onOpenProjects={() => changeTab("projects")}
              />
            </Panel>
            <Panel id="expense" active={tab}>
              <SectionFrame
                id="expense"
                title="Expense Analytics"
                description="Category mix, scope split, and monthly spend trend."
              >
                <ExpensesAnalytics currencies={renderCurrencies} />
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
                <ProjectsAnalytics currencies={renderCurrencies} />
              </SectionFrame>
            </Panel>
            <Panel id="department" active={tab}>
              <DepartmentAnalytics
                data={data}
                currencies={renderCurrencies}
                slug={rangeSlug(range)}
              />
            </Panel>
            <Panel id="employee" active={tab}>
              <EmployeeAnalytics
                data={data}
                currencies={renderCurrencies}
                slug={rangeSlug(range)}
              />
            </Panel>
            <Panel id="reimbursement" active={tab}>
              <ReimbursementAnalytics
                data={data}
                currencies={renderCurrencies}
                slug={rangeSlug(range)}
              />
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
              <AuditCompliance
                data={data}
                currencies={renderCurrencies}
                slug={rangeSlug(range)}
              />
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
  currencies,
  slug,
  onOpenProjects,
}: {
  data: LoadedData;
  currencies: string[];
  slug: string;
  onOpenProjects: () => void;
}) {
  const { projects, records, users } = data;
  // Counts come from the full record set (currency-agnostic); money is grouped
  // per currency (never summed across). Money charts are rendered per currency.
  const k = useMemo(() => deriveKpis(records), [records]);
  const approvedByCurrency = useMemo(
    () => totalsByCurrency(records.filter((r) => r.approvalStatus === "APPROVED")),
    [records],
  );
  const pendingByCurrency = useMemo(
    () =>
      totalsByCurrency(
        records.filter(
          (r) =>
            r.approvalStatus === "SUBMITTED" ||
            r.approvalStatus === "PENDING_REVIEW",
        ),
      ),
    [records],
  );
  const rejectedByCurrency = useMemo(
    () => totalsByCurrency(records.filter((r) => r.approvalStatus === "REJECTED")),
    [records],
  );
  const decided = k.approved.count + k.rejected.count;
  const approvalRate = decided > 0 ? (k.approved.count / decided) * 100 : 0;

  const processing = useMemo(() => deriveProcessing(records), [records]);

  // Money charts (trend + department spend) are per currency — never summed.
  const perCur = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((cur) => {
          const recs = records.filter((e) => (e.currency || "").toUpperCase() === cur);
          return [
            cur,
            {
              departments: deriveDepartments(recs, users).filter((d) => d.totalSpend > 0),
              monthly: deriveMonthlyApproved(recs, 12),
            },
          ];
        }),
      ),
    [currencies, records, users],
  );

  // Spark/MoM only make sense for a single currency (a summed-across-currency
  // trend line would be meaningless), so they're omitted when several are shown.
  const single = currencies.length === 1;
  const soleMonthly = single ? perCur[currencies[0]!]!.monthly : [];
  const lastTwo = soleMonthly.slice(-2);
  const momDelta =
    single && lastTwo.length === 2 && lastTwo[0]!.amount > 0
      ? ((lastTwo[1]!.amount - lastTwo[0]!.amount) / lastTwo[0]!.amount) * 100
      : null;

  const displayCurrency = currencies[0] ?? "INR";
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
            (totals.length > 0 ? totals : [{ currency: displayCurrency, amount: 0, count: 0 }]).map(
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
          trend={single ? momDelta : undefined}
          spark={single ? soleMonthly.slice(-8).map((m) => m.amount) : undefined}
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
          description="Approved expense value over time, per currency"
          className="lg:col-span-2"
        >
          <CurrencyMultiples
            currencies={currencies}
            render={(cur, accent) => (
              <AreaTrend
                data={perCur[cur]!.monthly.map((m) => ({ label: m.label, value: m.amount }))}
                accent={accent}
                format={(v) => formatMoney(v, cur)}
              />
            )}
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
        description="Top departments by approved spend, per currency"
      >
        <CurrencyMultiples
          currencies={currencies}
          render={(cur, accent) => {
            const departments = perCur[cur]!.departments;
            if (departments.length === 0) {
              return <p className="text-sm text-muted-foreground">No approved spend yet.</p>;
            }
            return (
              <RankingList
                accent={accent}
                items={departments.slice(0, 6).map((d) => ({
                  label: d.name,
                  valueText: compactMoney(d.totalSpend, cur),
                  ratio: d.totalSpend / (departments[0]?.totalSpend || 1),
                  sub: `${d.headcount} people · ${pct(d.shareOfSpend * 100)} of spend`,
                }))}
              />
            );
          }}
        />
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
              value={compactMoney(projects.totals.budget, displayCurrency)}
            />
            <KpiCard
              index={2}
              accent="violet"
              icon={TrendingUp}
              label="Approved spend"
              value={<MoneyTotals totals={projects.totals.spentByCurrency} compact />}
              hint={`${compactMoney(projects.totals.remaining, displayCurrency)} remaining vs budget`}
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

function DepartmentAnalytics({
  data,
  currencies,
  slug,
}: {
  data: LoadedData;
  currencies: string[];
  slug: string;
}) {
  const { records, users } = data;
  // Spend, share, risk and heatmap are all money → derived per currency so
  // nothing is summed across currencies; shown as colour-coded small multiples.
  const perCur = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((cur) => {
          const recs = records.filter((e) => (e.currency || "").toUpperCase() === cur);
          const departments = deriveDepartments(recs, users);
          const withSpend = departments.filter((d) => d.totalSpend > 0 || d.headcount > 0);
          const heatmap = deriveCategoryHeatmap(
            recs,
            users,
            departments.slice(0, 6).map((d) => d.name),
          );
          return [cur, { withSpend, heatmap }];
        }),
      ),
    [currencies, records, users],
  );
  // Department/headcount counts are currency-agnostic → shown once.
  const deptCount = new Set(
    users.map((u) => (u.department || "").trim()).filter(Boolean),
  ).size;

  return (
    <SectionFrame
      id="department"
      title="Department Analytics"
      description="Spend, headcount, throughput, and risk by department."
      onCsv={() =>
        downloadCsv(
          `opsflow-department-analytics_${slug}`,
          currencies.flatMap((cur) =>
            perCur[cur]!.withSpend.map((d) => ({ currency: cur, ...d })),
          ),
          [
            { label: "Currency", value: (d) => d.currency },
            { label: "Department", value: (d) => d.name },
            { label: "Headcount", value: (d) => d.headcount },
            { label: "Active", value: (d) => d.activeHeadcount },
            { label: "Approved spend", value: (d) => d.totalSpend },
            { label: "Expenses", value: (d) => d.expenseCount },
            { label: "Pending", value: (d) => d.pendingCount },
            { label: "Reimb. outstanding", value: (d) => d.reimbursementPending },
            { label: "Avg processing days", value: (d) => d.avgProcessingDays?.toFixed(2) ?? "" },
            { label: "Risk", value: (d) => d.risk.toFixed(2) },
          ],
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <KpiCard index={0} accent="violet" icon={Building2} label="Departments" value={deptCount} />
        <KpiCard
          index={1}
          accent="indigo"
          icon={Users}
          label="People tracked"
          value={users.length}
          hint={`${users.filter((u) => u.isActive).length} active`}
        />
      </div>

      {currencies.length > 1 && <CurrencyLegend currencies={currencies} />}

      <SectionCard title="Approved spend by department" description="Relative contribution, per currency">
        <CurrencyMultiples
          currencies={currencies}
          render={(cur, accent) => {
            const ws = perCur[cur]!.withSpend.filter((d) => d.totalSpend > 0).slice(0, 8);
            if (ws.length === 0) {
              return <p className="text-sm text-muted-foreground">No approved spend yet.</p>;
            }
            return (
              <BarList
                items={ws.map((d) => ({
                  label: d.name,
                  valueText: compactMoney(d.totalSpend, cur),
                  ratio: d.totalSpend / (ws[0]?.totalSpend || 1),
                  tone: currencyGradient(accent),
                }))}
              />
            );
          }}
        />
      </SectionCard>

      <SectionCard title="Spend distribution" description="Department × category heatmap, per currency">
        <CurrencyMultiples
          currencies={currencies}
          render={(cur, accent) => {
            const heatmap = perCur[cur]!.heatmap;
            if (heatmap.yLabels.length === 0) {
              return <p className="text-sm text-muted-foreground">No data.</p>;
            }
            return (
              <Heatmap
                accent={accent}
                xLabels={heatmap.xLabels}
                yLabels={heatmap.yLabels}
                matrix={heatmap.matrix}
                format={(v) => compactMoney(v, cur)}
              />
            );
          }}
        />
      </SectionCard>

      <SectionCard title="Department performance" description="Drill-down across every department">
        <CurrencyMultiples
          currencies={currencies}
          render={(cur) => <DepartmentTable rows={perCur[cur]!.withSpend} currency={cur} />}
        />
      </SectionCard>
    </SectionFrame>
  );
}

function DepartmentTable({ rows, currency }: { rows: DepartmentMetric[]; currency: string }) {
  return (
    <>
      {/* Mobile: a card per department instead of a 7-column scrolling table. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((d) => (
          <li key={d.name} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">{d.name}</span>
              <RiskBadge risk={d.risk} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <DeptStat label="Head count" value={`${d.activeHeadcount}/${d.headcount}`} />
              <DeptStat label="Approved spend" value={formatMoney(d.totalSpend, currency)} />
              <DeptStat label="Pending" value={String(d.pendingCount)} />
              <DeptStat label="Reimb. due" value={compactMoney(d.reimbursementPending, currency)} />
              <DeptStat
                label="Avg turnaround"
                value={d.avgProcessingDays === null ? "—" : `${d.avgProcessingDays.toFixed(1)}d`}
              />
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
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
    </>
  );
}

/** Compact label/value pair for the mobile department cards. */
function DeptStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium text-foreground">{value}</dd>
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

function EmployeeAnalytics({
  data,
  currencies,
  slug,
}: {
  data: LoadedData;
  currencies: string[];
  slug: string;
}) {
  const { records, users } = data;
  // Spend rankings/tables are money → per currency. Submitter/rejection counts
  // are currency-agnostic and shown once.
  const perCur = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((cur) => {
          const recs = records.filter((e) => (e.currency || "").toUpperCase() === cur);
          const employees = deriveEmployees(recs, users);
          return [cur, employees.filter((e) => e.totalSpend > 0)];
        }),
      ),
    [currencies, records, users],
  );
  const allEmployees = useMemo(() => deriveEmployees(records, users), [records, users]);
  const activeSubmitters = allEmployees.filter((e) => e.totalSpend > 0).length;
  const topRejected = [...allEmployees].sort((a, b) => b.rejectedCount - a.rejectedCount)[0];

  return (
    <SectionFrame
      id="employee"
      title="Employee Analytics"
      description="Who is spending, how much, and how clean their submissions are."
      onCsv={() =>
        downloadCsv(
          `opsflow-employee-analytics_${slug}`,
          currencies.flatMap((cur) => perCur[cur]!.map((e) => ({ currency: cur, ...e }))),
          [
            { label: "Currency", value: (e) => e.currency },
            { label: "Employee", value: (e) => e.name },
            { label: "Department", value: (e) => e.department },
            { label: "Approved spend", value: (e) => e.totalSpend },
            { label: "Submitted", value: (e) => e.submittedCount },
            { label: "Approved", value: (e) => e.approvedCount },
            { label: "Rejected", value: (e) => e.rejectedCount },
            { label: "Manual entries", value: (e) => e.manualCount },
            { label: "Avg amount", value: (e) => e.avgAmount.toFixed(2) },
          ],
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <KpiCard index={0} accent="indigo" icon={Users} label="Active submitters" value={activeSubmitters} />
        <KpiCard
          index={1}
          accent="rose"
          icon={XCircle}
          label="Most rejections"
          value={topRejected?.rejectedCount ?? 0}
          hint={topRejected?.rejectedCount ? topRejected.name : "None"}
          invertTrend
        />
      </div>

      {currencies.length > 1 && <CurrencyLegend currencies={currencies} />}

      <SectionCard title="Top employees by spend" description="Approved spend, ranked per currency">
        <CurrencyMultiples
          currencies={currencies}
          render={(cur, accent) => {
            const spenders = perCur[cur]!;
            if (spenders.length === 0) {
              return <p className="text-sm text-muted-foreground">No approved spend yet.</p>;
            }
            return (
              <RankingList
                accent={accent}
                items={spenders.slice(0, 8).map((e) => ({
                  label: e.name,
                  valueText: compactMoney(e.totalSpend, cur),
                  ratio: e.totalSpend / (spenders[0]?.totalSpend || 1),
                  sub: `${e.department} · ${e.approvedCount} approved`,
                }))}
              />
            );
          }}
        />
      </SectionCard>

      <SectionCard title="Employee breakdown" description="Full submission record, per currency">
        <CurrencyMultiples
          currencies={currencies}
          render={(cur) => <EmployeeBreakdown rows={perCur[cur]!} currency={cur} />}
        />
      </SectionCard>
    </SectionFrame>
  );
}

/** Employee submission breakdown (mobile cards + desktop table), one currency. */
function EmployeeBreakdown({
  rows,
  currency,
}: {
  rows: ReturnType<typeof deriveEmployees>;
  currency: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No approved spend yet.</p>;
  }
  return (
    <>
      {/* Mobile: a card per employee instead of a 7-column scrolling table. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.slice(0, 25).map((e) => (
          <li key={e.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.department}</p>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatMoney(e.totalSpend, currency)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Submitted <b className="tabular-nums text-foreground">{e.submittedCount}</b></span>
              <span>Approved <b className="tabular-nums text-foreground">{e.approvedCount}</b></span>
              <span>Rejected <b className="tabular-nums text-foreground">{e.rejectedCount}</b></span>
              <span>Manual <b className="tabular-nums text-foreground">{e.manualCount}</b></span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
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
            {rows.slice(0, 25).map((e) => (
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
    </>
  );
}

/* -------------------------- Reimbursement ------------------------------ */

function ReimbursementAnalytics({
  data,
  slug,
  currencies,
}: {
  data: LoadedData;
  slug: string;
  currencies: string[];
}) {
  const { reimbursementRecords, users } = data;
  // Status counts combine across currencies (counts, not money).
  const model = useMemo(
    () => deriveReimbursements(reimbursementRecords, users),
    [reimbursementRecords, users],
  );
  const pendingByCurrency = useMemo(
    () => totalsByCurrency(reimbursementRecords.filter((e) => e.reimbursementStatus !== "PAID")),
    [reimbursementRecords],
  );
  const paidByCurrency = useMemo(
    () => totalsByCurrency(reimbursementRecords.filter((e) => e.reimbursementStatus === "PAID")),
    [reimbursementRecords],
  );
  // Money charts are derived per currency so amounts are never summed across them.
  const perCurrency = useMemo(
    () =>
      Object.fromEntries(
        currencies.map((cur) => [
          cur,
          deriveReimbursements(
            reimbursementRecords.filter((e) => (e.currency || "").toUpperCase() === cur),
            users,
          ),
        ]),
      ),
    [currencies, reimbursementRecords, users],
  );

  return (
    <SectionFrame
      id="reimbursement"
      title="Reimbursement Analytics"
      description="Outstanding payouts and how they are distributed."
      onCsv={() =>
        downloadCsv(
          `opsflow-reimbursement_${slug}`,
          currencies.flatMap((cur) =>
            perCurrency[cur]!.byDepartment.map((d) => ({ currency: cur, ...d })),
          ),
          [
            { label: "Currency", value: (d) => d.currency },
            { label: "Department", value: (d) => d.name },
            { label: "Outstanding", value: (d) => d.outstanding },
            { label: "Paid", value: (d) => d.paid },
          ],
        )
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="amber"
          icon={Banknote}
          label="Outstanding payouts"
          value={<MoneyTotals totals={pendingByCurrency} compact />}
          hint={`${model.outstandingCount} approved expenses unpaid`}
        />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Paid out"
          value={<MoneyTotals totals={paidByCurrency} compact />}
          hint={`${model.byStatus.PAID.count} reimbursed`}
        />
        <KpiCard
          index={2}
          accent="sky"
          icon={Clock}
          label="Processing"
          value={model.byStatus.PROCESSING.count}
        />
        <KpiCard
          index={3}
          accent="rose"
          icon={Gauge}
          label="Pending"
          value={model.byStatus.PENDING.count}
          invertTrend
        />
      </div>

      {currencies.length > 1 && <CurrencyLegend currencies={currencies} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Status mix" description="Approved expenses by reimbursement status">
          <CurrencyMultiples
            currencies={currencies}
            render={(cur) => {
              const m = perCurrency[cur]!;
              return (
                <DonutChart
                  segments={[
                    { label: "Pending", value: m.byStatus.PENDING.amount, accent: "rose" },
                    { label: "Processing", value: m.byStatus.PROCESSING.amount, accent: "sky" },
                    { label: "Paid", value: m.byStatus.PAID.amount, accent: "emerald" },
                  ]}
                  centerValue={compactMoney(
                    m.byStatus.PENDING.amount +
                      m.byStatus.PROCESSING.amount +
                      m.byStatus.PAID.amount,
                    cur,
                  )}
                  centerLabel="approved"
                  formatValue={(v) => compactMoney(v, cur)}
                  emptyLabel="No approved expenses to reimburse yet."
                />
              );
            }}
          />
        </SectionCard>
        <SectionCard title="Outstanding by department" description="Where payouts are owed">
          <CurrencyMultiples
            currencies={currencies}
            render={(cur, accent) => {
              const m = perCurrency[cur]!;
              const items = m.byDepartment.filter((d) => d.outstanding > 0).slice(0, 6);
              if (items.length === 0) {
                return <p className="text-sm text-muted-foreground">Nothing outstanding.</p>;
              }
              return (
                <RankingList
                  accent={accent}
                  items={items.map((d) => ({
                    label: d.name,
                    valueText: compactMoney(d.outstanding, cur),
                    ratio: d.outstanding / (m.byDepartment[0]?.outstanding || 1),
                  }))}
                />
              );
            }}
          />
        </SectionCard>
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Audit ----------------------------------- */

function AuditCompliance({
  data,
  slug,
  currencies,
}: {
  data: LoadedData;
  slug: string;
  currencies: string[];
}) {
  const { records, users } = data;
  // Derived per currency so the high-value threshold and flag amounts are never
  // computed across currencies; counts summed, flags concatenated.
  const audits = useMemo(
    () =>
      currencies.map((cur) =>
        deriveAudit(records.filter((e) => (e.currency || "").toUpperCase() === cur), users),
      ),
    [currencies, records, users],
  );
  const processing = useMemo(() => deriveProcessing(records), [records]);
  const manualCount = audits.reduce((s, a) => s + a.manualCount, 0);
  const missingDocCount = audits.reduce((s, a) => s + a.missingDocCount, 0);
  const manualPct = records.length > 0 ? (manualCount / records.length) * 100 : null;
  const flags = useMemo(
    () =>
      audits
        .flatMap((a) => a.flags)
        .sort((a, b) =>
          a.severity === b.severity
            ? b.date.localeCompare(a.date)
            : a.severity === "high"
              ? -1
              : 1,
        ),
    [audits],
  );

  return (
    <SectionFrame
      id="audit"
      title="Audit & Compliance"
      description="Policy signals: manual entries, missing documents, and high-value flags."
      onCsv={() =>
        downloadCsv(`opsflow-audit-flags_${slug}`, flags, [
          { label: "Employee", value: (f) => f.employee },
          { label: "Department", value: (f) => f.department },
          { label: "Reason", value: (f) => f.reason },
          { label: "Currency", value: (f) => f.currency },
          { label: "Amount", value: (f) => f.amount },
          { label: "Severity", value: (f) => f.severity },
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
          value={manualPct === null ? "—" : pct(manualPct)}
          hint={`${manualCount} entries without a receipt`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="rose"
          icon={AlertTriangle}
          label="Missing documentation"
          value={missingDocCount}
          hint="expenses with no attached document"
          invertTrend
        />
        <KpiCard
          index={2}
          accent="violet"
          icon={ShieldCheck}
          label="High-value flags"
          value={flags.length}
          hint="manual & high-value policy flags"
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
        {flags.length === 0 ? (
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
                {flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.employee}</TableCell>
                    <TableCell className="text-muted-foreground">{f.department}</TableCell>
                    <TableCell>{f.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(f.amount, f.currency)}
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
