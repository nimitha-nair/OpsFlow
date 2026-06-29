/**
 * HR Insights Dashboard — the HR-facing counterpart to the Admin Reports
 * workspace. Same shell (section rail + per-section export) but HR-relevant
 * sections: Workforce, Expense Governance, Reimbursement Operations, AI
 * Adoption, and Audit & Risk. All metrics are derived from data HR can
 * actually read (overview + expense lifecycle list + user directory). The
 * detailed AI extraction-quality analytics are an Admin-only audit concern and
 * are intentionally excluded here — HR sees only the AI-adoption signal.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  UserPlus,
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
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { BarList } from "./charts";
import { DonutGauge, KpiCard, RankingList } from "./bi";
import { MoneyTotals } from "../common/MoneyTotals";
import { CurrencyScope } from "./CurrencyScope";
import { PerCurrencySections } from "./PerCurrencySections";
import { formatCurrencyTotals, totalsByCurrency } from "../../lib/currency";
import { paletteAt } from "../common/accent";
import { SectionFrame } from "./workspace/shell";
import { type SectionDef } from "./workspace/report-sections";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ExpensesTab } from "./ExpensesTab";
import { ExpenseDetailTable } from "./ExpenseDetailTable";
import { formatCompactMoney, formatMoney } from "../../lib/format";
import { DateBasisToggle } from "../common/DateBasisToggle";
import { DateRangeFilter } from "../common/DateRangeFilter";
import { makeRange, rangeToParams, rangeSlug, type DateRange } from "../../lib/date-range";
import { ActiveRangeBadge } from "../common/ActiveRangeBadge";
import { MobileFiltersSheet } from "../mobile/MobileFiltersSheet";
import { MobileActionMenu, type MobileAction } from "../mobile/MobileActionMenu";
import { downloadCsv, printElement } from "../../lib/export";
import { getReportsOverview } from "../../lib/reports-api";
import { listReviewExpenses, listReimbursements } from "../../lib/expenses-api";
import { listUsers } from "../../lib/users-api";
import type { OverviewReport } from "../../types/reports";
import type { Expense } from "../../types/expense";
import type { User } from "../../types/user";
import {
  deriveAudit,
  deriveProcessing,
  deriveReimbursements,
} from "./workspace/derive";

const TABS: SectionDef[] = [
  { id: "workforce", label: "Workforce", icon: Users },
  { id: "expense", label: "Expenses", icon: Wallet },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
  { id: "reimbursement", label: "Reimbursements", icon: Banknote },
  { id: "ai", label: "AI Adoption", icon: Sparkles },
  { id: "compliance", label: "Compliance", icon: AlertTriangle },
];

const pct = (n: number) => `${Math.round(n)}%`;

function withinDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

interface LoadedData {
  overview: OverviewReport;
  records: Expense[];
  reimbursementRecords: Expense[];
  users: User[];
}

export function HrInsightsDashboard() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("workforce");
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [basis, setBasis] = useState<"expenseDate" | "submittedAt">("expenseDate");
  // Multi-currency: null = default (all present); array = explicit pick.
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[] | null>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  // employeeId → name, for the print-only per-expense detail listing.
  const userNameMap = useMemo(
    () => new Map((data?.users ?? []).map((u) => [u.id, u.name] as const)),
    [data],
  );
  const currencyTotals = useMemo(
    () => (data ? totalsByCurrency(data.records) : []),
    [data],
  );
  const allCurrencies = currencyTotals.map((t) => t.currency);
  const defaultCurrencies = allCurrencies.includes("INR")
    ? ["INR"]
    : allCurrencies.slice(0, 1);
  const picked = selectedCurrencies?.filter((c) => allCurrencies.includes(c)) ?? null;
  const renderCurrencies = picked && picked.length > 0 ? picked : defaultCurrencies;
  // Per-currency slice of the loaded data (records/reimbursements filtered).
  const scopedFor = (c: string): LoadedData => {
    const match = (r: Expense) => (r.currency || "INR").toUpperCase() === c;
    return {
      ...data!,
      records: data!.records.filter(match),
      reimbursementRecords: data!.reimbursementRecords.filter(match),
    };
  };

  const panelNode = (id: string) =>
    panelsRef.current?.querySelector<HTMLElement>(`[data-panel="${id}"]`) ?? null;
  const reveal = (clone: HTMLElement) => clone.classList.remove("hidden");
  const revealAll = (clone: HTMLElement) =>
    clone.querySelectorAll(".report-panel").forEach((p) => p.classList.remove("hidden"));

  const exportCurrentTab = () => printElement(panelNode(tab), `opsflow-hr-${tab}`, reveal);
  const exportAll = () => printElement(panelsRef.current, "opsflow-hr-report", revealAll);

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const params = { ...rangeToParams(range), basis };
    const [overview, records, usersResp, reimbursementRecords] = await Promise.all([
      getReportsOverview(params),
      listReviewExpenses("ALL", params),
      listUsers({ limit: 1000 }),
      listReimbursements(rangeToParams(range)),
    ]);
    if (signal?.cancelled) return;
    setData({ overview, records, reimbursementRecords, users: usersResp.data });
    setError(null);
  }, [range, basis]);

  useEffect(() => {
    const signal = { cancelled: false };
    void (async () => {
      try {
        await load(signal);
      } catch {
        if (!signal.cancelled) setError("We couldn't load HR insights. Please try again.");
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
      .catch(() => setError("We couldn't refresh HR insights. Please try again."))
      .finally(() => setRefreshing(false));
  };

  return (
    <>
      <PageHeader
        title="HR Insights"
        description="Workforce, governance, and compliance intelligence for HR."
        breadcrumbs={[{ label: "HR" }, { label: "Insights" }]}
        actions={
          !loading && !error && data ? (
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
                <Button size="sm" onClick={exportAll}>
                  <Download className="size-4" />
                  Complete HR Report
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
                  <HrFilterField label="Date basis">
                    <DateBasisToggle value={basis} onChange={setBasis} />
                  </HrFilterField>
                  <HrFilterField label="Date range">
                    <DateRangeFilter value={range} onChange={setRange} />
                  </HrFilterField>
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
                      label: "Complete HR Report",
                      icon: <Download className="size-4" />,
                      onSelect: exportAll,
                    },
                  ] satisfies MobileAction[]}
                />
              </div>
            </>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState label="Loading HR insights…" />
      ) : error || !data ? (
        <ErrorState
          title="Couldn't load HR insights"
          description={error ?? "No data."}
          onRetry={onRefresh}
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
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

          {currencyTotals.length > 0 && (
            <div className="no-print -mt-2">
              <CurrencyScope
                totals={currencyTotals}
                selected={renderCurrencies}
                onChange={setSelectedCurrencies}
              />
            </div>
          )}

          <div ref={panelsRef} className="flex min-w-0 flex-col">
            {/* Workforce is headcount, not money → shown once. */}
            <HrPanel id="workforce" active={tab}>
              <Workforce data={data} slug={rangeSlug(range)} />
            </HrPanel>
            <HrPanel id="expense" active={tab}>
              <SectionFrame
                id="hr-expense"
                title="Expense Analytics"
                description="Category mix, scope split, and monthly spend trend."
              >
                <PerCurrencySections currencies={renderCurrencies}>
                  {(c) => <ExpensesTab currency={c} />}
                </PerCurrencySections>
                {/* Print-only: every expense by currency, in tab + full prints. */}
                <ExpenseDetailTable
                  expenses={data.records}
                  scope="admin"
                  employeeNames={userNameMap}
                />
              </SectionFrame>
            </HrPanel>
            <HrPanel id="approvals" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => <Governance data={scopedFor(c)} />}
              </PerCurrencySections>
            </HrPanel>
            <HrPanel id="reimbursement" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => <Reimbursement data={scopedFor(c)} slug={rangeSlug(range)} />}
              </PerCurrencySections>
            </HrPanel>
            {/* AI extraction metrics are currency-agnostic → shown once. */}
            <HrPanel id="ai" active={tab}>
              <AiProcessing data={data} />
            </HrPanel>
            <HrPanel id="compliance" active={tab}>
              <PerCurrencySections currencies={renderCurrencies}>
                {(c) => <AuditRisk data={scopedFor(c)} slug={rangeSlug(range)} />}
              </PerCurrencySections>
            </HrPanel>
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Workforce ------------------------------- */

/** Labelled, full-width control wrapper used inside the mobile Filters sheet. */
function HrFilterField({
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
function HrPanel({
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

function Workforce({ data, slug }: { data: LoadedData; slug: string }) {
  const { users } = data;
  const activeCount = users.filter((u) => u.isActive).length;
  const newHires = users.filter((u) => withinDays(u.createdAt, 30)).length;

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      const d = u.department?.trim() || "Unassigned";
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [users]);

  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) map.set(u.role, (map.get(u.role) ?? 0) + 1);
    return [...map.entries()].map(([role, count]) => ({ role, count }));
  }, [users]);

  const maxDept = byDept[0]?.count || 1;

  return (
    <SectionFrame
      id="workforce"
      title="Workforce Overview"
      description="Headcount, distribution, and recent joiners."
      onCsv={() =>
        downloadCsv(`opsflow-hr-workforce_${slug}`, byDept, [
          { label: "Department", value: (d) => d.name },
          { label: "Headcount", value: (d) => d.count },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} emphasize accent="indigo" icon={Users} label="Total employees" value={users.length} />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Active"
          value={activeCount}
          hint={`${pct((activeCount / Math.max(1, users.length)) * 100)} of workforce`}
        />
        <KpiCard index={2} accent="violet" icon={UserPlus} label="New hires (30d)" value={newHires} />
        <KpiCard index={3} accent="amber" icon={Users} label="Departments" value={byDept.length} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Department distribution" description="Headcount by department">
          <BarList
            items={byDept.slice(0, 8).map((d, i) => ({
              label: d.name,
              valueText: String(d.count),
              ratio: d.count / maxDept,
              tone: paletteAt(i),
            }))}
          />
        </SectionCard>
        <SectionCard title="Role mix" description="Composition by access role">
          <RankingList
            accent="indigo"
            items={byRole.map((r) => ({
              label: r.role,
              valueText: String(r.count),
              ratio: r.count / Math.max(1, ...byRole.map((x) => x.count)),
            }))}
          />
        </SectionCard>
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Governance ------------------------------ */

function Governance({ data }: { data: LoadedData }) {
  const { records } = data;
  // Counts derived from the (currency-scoped) records so each per-currency
  // section is correct — not the backend overview's dominant-currency KPIs.
  const k = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    for (const e of records) {
      if (e.approvalStatus === "APPROVED") approved += 1;
      else if (e.approvalStatus === "REJECTED") rejected += 1;
      else if (
        e.approvalStatus === "SUBMITTED" ||
        e.approvalStatus === "PENDING_REVIEW"
      )
        pending += 1;
    }
    return {
      approved: { count: approved },
      rejected: { count: rejected },
      pending: { count: pending },
    };
  }, [records]);
  // Pending amount grouped per currency (never summed across currencies).
  const pendingByCurrency = useMemo(
    () =>
      totalsByCurrency(
        records.filter(
          (e) =>
            e.approvalStatus === "SUBMITTED" ||
            e.approvalStatus === "PENDING_REVIEW",
        ),
      ),
    [records],
  );
  const processing = useMemo(() => deriveProcessing(records), [records]);
  const decided = k.approved.count + k.rejected.count;
  const approvalRate = decided > 0 ? (k.approved.count / decided) * 100 : 0;
  const rejectionRate = decided > 0 ? (k.rejected.count / decided) * 100 : 0;
  const manualReviewed = records.filter(
    (e) => e.creationMethod === "MANUAL" && (e.approvalStatus === "SUBMITTED" || e.approvalStatus === "PENDING_REVIEW"),
  ).length;

  return (
    <SectionFrame
      id="governance"
      title="Expense Governance"
      description="Approval throughput, rejection trends, and review workload."
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="amber"
          icon={Clock}
          label="Pending approvals"
          value={k.pending.count}
          hint={`${formatCurrencyTotals(pendingByCurrency, formatCompactMoney)} in queue`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="sky"
          icon={Timer}
          label="Approval turnaround"
          value={processing.avgDays === null ? "—" : `${processing.avgDays.toFixed(1)}d`}
          hint={processing.reviewedCount > 0 ? `${processing.reviewedCount} reviewed` : undefined}
        />
        <KpiCard
          index={2}
          accent="rose"
          icon={XCircle}
          label="Rejection rate"
          value={pct(rejectionRate)}
          hint={`${k.rejected.count} rejected`}
          invertTrend
        />
        <KpiCard
          index={3}
          accent="violet"
          icon={Receipt}
          label="Manual-entry reviews"
          value={manualReviewed}
          hint="awaiting review, no receipt"
          invertTrend
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Approval rate" description="Reviewed expenses approved" className="lg:col-span-1">
          <div className="flex justify-center py-2">
            <DonutGauge
              value={approvalRate}
              accent={approvalRate >= 80 ? "emerald" : approvalRate >= 60 ? "amber" : "rose"}
              centerLabel="approved"
              centerSub={`${decided} reviewed`}
            />
          </div>
        </SectionCard>
        <SectionCard title="Turnaround distribution" description="Time from submission to decision" className="lg:col-span-2">
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
      </div>
    </SectionFrame>
  );
}

/* --------------------------- Reimbursement ----------------------------- */

function Reimbursement({ data, slug }: { data: LoadedData; slug: string }) {
  const { reimbursementRecords, users, overview } = data;
  // Per-currency section → use the scoped records' currency, not the dominant.
  const currency = (reimbursementRecords[0]?.currency || overview.activeCurrency).toUpperCase();
  const model = useMemo(() => deriveReimbursements(reimbursementRecords, users), [reimbursementRecords, users]);
  // Headline payouts grouped per currency (never summed across currencies).
  const pendingByCurrency = useMemo(
    () => totalsByCurrency(reimbursementRecords.filter((e) => e.reimbursementStatus !== "PAID")),
    [reimbursementRecords],
  );
  const paidByCurrency = useMemo(
    () => totalsByCurrency(reimbursementRecords.filter((e) => e.reimbursementStatus === "PAID")),
    [reimbursementRecords],
  );

  return (
    <SectionFrame
      id="reimbursement"
      title="Reimbursement Operations"
      description="Outstanding payouts and departmental distribution."
      onCsv={() =>
        downloadCsv(`opsflow-hr-reimbursement_${slug}`, model.byDepartment, [
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
          label="Pending reimbursements"
          value={<MoneyTotals totals={pendingByCurrency} compact />}
          hint={`${model.outstandingCount} unpaid`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Paid out"
          value={<MoneyTotals totals={paidByCurrency} compact />}
          hint={`${model.byStatus.PAID.count} reimbursed`}
        />
        <KpiCard index={2} accent="sky" icon={Clock} label="Processing" value={model.byStatus.PROCESSING.count} />
        <KpiCard index={3} accent="rose" icon={AlertTriangle} label="Pending" value={model.byStatus.PENDING.count} invertTrend />
      </div>

      <SectionCard title="Outstanding by department" description="Where payouts are owed">
        {model.byDepartment.filter((d) => d.outstanding > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
        ) : (
          <RankingList
            accent="amber"
            items={model.byDepartment
              .filter((d) => d.outstanding > 0)
              .slice(0, 8)
              .map((d) => ({
                label: d.name,
                valueText: formatCompactMoney(d.outstanding, currency),
                ratio: d.outstanding / (model.byDepartment[0]?.outstanding || 1),
                sub: `${formatMoney(d.paid, currency)} paid`,
              }))}
          />
        )}
      </SectionCard>
      <p className="text-xs text-muted-foreground">
        Average reimbursement time isn't shown — payouts don't yet carry a
        settlement timestamp. Add one to enable cycle-time tracking.
      </p>
    </SectionFrame>
  );
}

/* ---------------------------- AI Processing ---------------------------- */

function AiProcessing({ data }: { data: LoadedData }) {
  const { records } = data;
  const aiCreated = records.filter((e) => e.creationMethod === "AI").length;
  const manualCreated = records.filter((e) => e.creationMethod === "MANUAL").length;
  const known = aiCreated + manualCreated;
  const aiPct = known > 0 ? (aiCreated / known) * 100 : null;
  const multiDoc = records.filter((e) => (e.documentIds?.length ?? 0) > 1).length;

  return (
    <SectionFrame
      id="ai"
      title="AI Adoption"
      description="How much of the expense workload is processed with AI assistance."
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="violet"
          icon={Sparkles}
          label="AI-created expenses"
          value={aiPct === null ? "—" : pct(aiPct)}
          hint={`${aiCreated} of ${known} with a known method`}
        />
        <KpiCard
          index={1}
          accent="slate"
          icon={Receipt}
          label="Manually entered"
          value={manualCreated}
          hint="no AI extraction used"
          invertTrend
        />
        <KpiCard
          index={2}
          accent="indigo"
          icon={Sparkles}
          label="Multi-document"
          value={multiDoc}
          hint="expenses with 2+ files"
        />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Detailed extraction-quality analytics (confidence scores, provider
        performance, correction trends) are part of the platform AI audit and
        live in the Admin reports. This view shows the AI-adoption signal that's
        relevant to HR operations.
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Audit & Risk ---------------------------- */

function AuditRisk({ data, slug }: { data: LoadedData; slug: string }) {
  const { records, users, overview } = data;
  // Per-currency section → use the scoped records' currency, not the dominant.
  const currency = (records[0]?.currency || overview.activeCurrency).toUpperCase();
  const audit = useMemo(() => deriveAudit(records, users), [records, users]);

  return (
    <SectionFrame
      id="risk"
      title="Audit & Risk"
      description="Manual entries, missing documents, and policy flags."
      onCsv={() =>
        downloadCsv(`opsflow-hr-audit_${slug}`, audit.flags, [
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
          label="Manual-entry volume"
          value={audit.manualCount}
          hint={audit.manualPct === null ? undefined : `${pct(audit.manualPct)} of submissions`}
          invertTrend
        />
        <KpiCard index={1} accent="rose" icon={AlertTriangle} label="Missing documentation" value={audit.missingDocCount} invertTrend />
        <KpiCard index={2} accent="violet" icon={ShieldCheck} label="Suspicious submissions" value={audit.flags.length} invertTrend />
        <KpiCard index={3} accent="slate" icon={XCircle} label="Rejected" value={audit.rejectedCount} invertTrend />
      </div>

      <SectionCard title="Flagged submissions" description="Prioritized compliance review">
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
                    <TableCell className="text-right tabular-nums">{formatMoney(f.amount, currency)}</TableCell>
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
