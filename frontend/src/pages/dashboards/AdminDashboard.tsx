import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  HandCoins,
  Plus,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { MetricCard } from "../../components/common/MetricCard";
import { QuickCreateTaskDialog } from "../../components/tasks/QuickCreateTaskDialog";
import { filterByDate, makeRange, monthsToParams, type DateRange } from "../../lib/date-range";
import { DashboardHero } from "../../components/dashboard/DashboardHero";
import { ActivityFeed } from "../../components/activity/ActivityFeed";
import { TicketsWidget } from "../../components/dashboard/TicketsWidget";
import { BarList, ColumnChart } from "../../components/reports/charts";
import {
  ApprovalStatusBadge,
  ReimbursementBadge,
} from "../../components/expenses/ExpenseBadges";
import {
  apiErrorMessage,
  listReviewExpenses,
} from "../../lib/expenses-api";
import {
  getReportsAiAnalytics,
  getReportsExpenses,
  getReportsProjects,
} from "../../lib/reports-api";
import { listUsers } from "../../lib/users-api";
import { formatDate, formatMoney } from "../../lib/format";
import type { Expense } from "../../types/expense";
import type {
  AiAnalyticsReport,
  ExpensesReport,
  ProjectsReport,
} from "../../types/reports";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

function utilTone(util: number | null): string {
  if (util === null) return "from-slate-400 to-slate-500";
  if (util > 100) return "from-rose-500 to-red-500";
  if (util >= 80) return "from-amber-500 to-orange-500";
  return "from-emerald-500 to-teal-500";
}

export function AdminDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [trend, setTrend] = useState<ExpensesReport | null>(null);
  const [projects, setProjects] = useState<ProjectsReport | null>(null);
  const [ai, setAi] = useState<AiAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [quickOpen, setQuickOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [all, users, exp, proj, aiRep] = await Promise.all([
          listReviewExpenses("ALL"),
          listUsers({ limit: 100 }),
          getReportsExpenses(monthsToParams(6)),
          getReportsProjects(),
          getReportsAiAnalytics(monthsToParams(6)),
        ]);
        if (cancelled) return;
        setExpenses(all);
        setUserNames(new Map(users.data.map((u) => [u.id, u.name])));
        setTrend(exp);
        setProjects(proj);
        setAi(aiRep);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load dashboard."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const employeeName = (id: string) => userNames.get(id) ?? "Unknown";

  // Date range scopes every expense-derived metric on the dashboard.
  const dated = useMemo(
    () => filterByDate(expenses, (e) => e.expenseDate, range),
    [expenses, range],
  );

  const kpis = useMemo(() => {
    let spend = 0;
    let pending = 0;
    let approved = 0;
    let reimbursePending = 0;
    for (const e of dated) {
      if (e.approvalStatus === "APPROVED") {
        approved += 1;
        spend += e.amount;
        if (e.reimbursementStatus !== "PAID") reimbursePending += 1;
      } else if (PENDING.includes(e.approvalStatus)) {
        pending += 1;
      }
    }
    return { spend, pending, approved, reimbursePending };
  }, [dated]);

  const reimbursementQueue = useMemo(
    () =>
      dated
        .filter(
          (e) =>
            e.approvalStatus === "APPROVED" && e.reimbursementStatus !== "PAID",
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [dated],
  );

  const recent = useMemo(
    () =>
      [...dated]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 6),
    [dated],
  );

  return (
    <>
      <DashboardHero
        title="Organization overview"
        status={
          loading ? (
            "Loading organization metrics…"
          ) : (
            <>
              <strong className="font-semibold text-foreground">
                {formatMoney(kpis.spend)}
              </strong>{" "}
              approved spend ·{" "}
              <strong className="font-semibold text-foreground">
                {kpis.pending}
              </strong>{" "}
              pending approval
            </>
          )
        }
        primary={{
          label: "View Reports",
          to: "/admin/reports",
          icon: <ArrowRight className="size-4" />,
        }}
        secondary={{ label: "Reimbursements", to: "/admin/expenses/reimbursements" }}
      />

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load dashboard"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="no-print flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" onClick={() => setQuickOpen(true)}>
              <Plus className="size-4" />
              New Task
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/projects/new")}>
              <Briefcase className="size-4" />
              New Project
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/departments")}>
              <Building2 className="size-4" />
              New Department
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/reports")}>
              <BarChart3 className="size-4" />
              Reports
            </Button>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            <MetricCard
              index={0}
              emphasize
              accent="indigo"
              icon={Wallet}
              label="Total Spend"
              value={formatMoney(kpis.spend)}
              hint={`${kpis.approved} approved expenses`}
            />
            <MetricCard
              index={1}
              accent="amber"
              icon={Clock}
              label="Pending Approvals"
              value={kpis.pending}
              to="/admin/expenses"
            />
            <MetricCard
              index={2}
              accent="emerald"
              icon={CheckCircle2}
              label="Approved Expenses"
              value={kpis.approved}
              to="/admin/expenses"
            />
            <MetricCard
              index={3}
              accent="sky"
              icon={HandCoins}
              label="Reimbursements Pending"
              value={kpis.reimbursePending}
              to="/admin/expenses/reimbursements"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <SectionCard
              title="Approved spend trend"
              description="Last 6 months"
              className="lg:col-span-2"
            >
              {trend && trend.monthlyTrend.some((m) => m.amount > 0) ? (
                <ColumnChart
                  items={trend.monthlyTrend.map((m) => {
                    const max = Math.max(
                      1,
                      ...trend.monthlyTrend.map((x) => x.amount),
                    );
                    return {
                      key: m.month,
                      ratio: m.amount / max,
                      label: monthLabel(m.month),
                      title: `${monthLabel(m.month)} · ${formatMoney(m.amount)}`,
                    };
                  })}
                />
              ) : (
                <EmptyState
                  compact
                  icon={Wallet}
                  title="No approved spend yet"
                  description="The trend appears once expenses are approved."
                />
              )}
            </SectionCard>

            <SectionCard title="AI usage" description="Receipt extraction, last 6 months">
              {ai && ai.totals.total > 0 ? (
                <dl className="flex flex-col gap-3">
                  <AiStat label="Analyses run" value={String(ai.totals.total)} />
                  <AiStat
                    label="Success rate"
                    value={
                      ai.totals.successRate === null
                        ? "—"
                        : `${ai.totals.successRate}%`
                    }
                  />
                  <AiStat
                    label="Avg confidence"
                    value={
                      ai.totals.averageConfidence === null
                        ? "—"
                        : `${ai.totals.averageConfidence}%`
                    }
                  />
                  <Link
                    to="/admin/reports"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Bot className="size-3" /> Full AI analytics{" "}
                    <ArrowRight className="size-3" />
                  </Link>
                </dl>
              ) : (
                <EmptyState
                  compact
                  icon={Bot}
                  title="No AI analyses yet"
                  description="Metrics appear once receipts are analyzed."
                />
              )}
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard
              title="Top project utilization"
              description="Approved spend vs budget"
            >
              {projects && projects.projects.length > 0 ? (
                (() => {
                  const top = [...projects.projects]
                    .sort((a, b) => b.totalSpent - a.totalSpent)
                    .slice(0, 6);
                  // Projects without a budget have null utilization; show their
                  // spend relative to the highest spender so the bar still has
                  // length instead of rendering empty.
                  const maxSpent = Math.max(1, ...top.map((p) => p.totalSpent));
                  return (
                    <BarList
                      items={top.map((p) => ({
                        label: p.projectName,
                        valueText:
                          p.utilization === null
                            ? formatMoney(p.totalSpent, projects.currency)
                            : `${p.utilization}%`,
                        ratio:
                          p.utilization === null
                            ? Math.min(1, p.totalSpent / maxSpent)
                            : Math.min(1, p.utilization / 100),
                        tone: utilTone(p.utilization),
                      }))}
                    />
                  );
                })()
              ) : (
                <EmptyState
                  compact
                  icon={Wallet}
                  title="No project spend"
                  description="Project utilization appears once expenses are approved."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Reimbursement queue"
              description="Approved expenses awaiting payment"
              actions={
                <Link
                  to="/admin/expenses/reimbursements"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Manage <ArrowRight className="size-3" />
                </Link>
              }
            >
              {reimbursementQueue.length === 0 ? (
                <EmptyState
                  compact
                  icon={HandCoins}
                  title="Nothing pending"
                  description="Approved expenses awaiting reimbursement appear here."
                />
              ) : (
                <ul className="flex flex-col divide-y">
                  {reimbursementQueue.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {employeeName(e.employeeId)}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatMoney(e.amount, e.currency)} ·{" "}
                          {formatDate(e.expenseDate)}
                        </p>
                      </div>
                      <ReimbursementBadge status={e.reimbursementStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Recent activity"
            description="Latest expense movements across the organization"
            actions={
              <Link
                to="/admin/expenses"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="size-3" />
              </Link>
            }
          >
            {recent.length === 0 ? (
              <EmptyState
                compact
                icon={Wallet}
                title="No activity yet"
                description="Once employees submit expenses, the latest movements show up here. Start by setting up your projects and team."
                action={
                  <div className="flex items-center gap-3">
                    <Link
                      to="/admin/projects"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Set up projects
                    </Link>
                    <Link
                      to="/admin/users"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Add team members
                    </Link>
                  </div>
                }
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {recent.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/admin/expenses/${e.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {employeeName(e.employeeId)}
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {e.description || "Untitled expense"}
                          </span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatMoney(e.amount, e.currency)} ·{" "}
                          {formatDate(e.updatedAt)}
                        </p>
                      </div>
                      <ApprovalStatusBadge status={e.approvalStatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <TicketsWidget basePath="/admin" showRequester />
            <SectionCard
              title="Organization activity"
              description="Tickets, tasks, expenses and team changes"
              actions={
                <Link
                  to="/admin/activity"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View all <ArrowRight className="size-3" />
                </Link>
              }
            >
              <ActivityFeed limit={8} compact />
            </SectionCard>
          </div>
        </div>
      )}

      <QuickCreateTaskDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
    </>
  );
}

function AiStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
