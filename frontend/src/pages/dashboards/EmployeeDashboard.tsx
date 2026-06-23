import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  FilePlus2,
  FileText,
  LifeBuoy,
  Plus,
  Receipt,
  XCircle,
} from "lucide-react";

import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { SectionCard } from "../../components/common/SectionCard";
import { MetricCard } from "../../components/common/MetricCard";
import { DashboardHero } from "../../components/dashboard/DashboardHero";
import { EmployeeGettingStarted } from "../../components/onboarding/EmployeeGettingStarted";
import { MyTasksWidget } from "../../components/dashboard/MyTasksWidget";
import { TicketsWidget } from "../../components/dashboard/TicketsWidget";
import { filterByDate, makeRange, type DateRange } from "../../lib/date-range";
import {
  ApprovalStatusBadge,
  CreationMethodBadge,
} from "../../components/expenses/ExpenseBadges";
import { apiErrorMessage, listMyExpenses } from "../../lib/expenses-api";
import { formatDate, formatMoney } from "../../lib/format";
import type { Expense } from "../../types/expense";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];

export function EmployeeDashboard() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const mine = await listMyExpenses();
        if (!cancelled) setExpenses(mine);
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

  const dated = useMemo(
    () => filterByDate(expenses, (e) => e.expenseDate, range),
    [expenses, range],
  );

  const counts = useMemo(() => {
    const c = { draft: 0, pending: 0, approved: 0, rejected: 0 };
    for (const e of dated) {
      if (e.approvalStatus === "DRAFT") c.draft += 1;
      else if (PENDING.includes(e.approvalStatus)) c.pending += 1;
      else if (e.approvalStatus === "APPROVED") c.approved += 1;
      else if (e.approvalStatus === "REJECTED") c.rejected += 1;
    }
    return c;
  }, [dated]);

  const recent = useMemo(
    () =>
      [...dated]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 6),
    [dated],
  );

  const latestDraft = useMemo(
    () =>
      [...expenses]
        .filter((e) => e.approvalStatus === "DRAFT")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0],
    [expenses],
  );

  return (
    <>
      <DashboardHero
        title="Your expenses"
        status={
          loading ? (
            "Loading your expenses…"
          ) : (
            <>
              <strong className="font-semibold text-foreground">
                {counts.draft}
              </strong>{" "}
              draft{counts.draft === 1 ? "" : "s"} ·{" "}
              <strong className="font-semibold text-foreground">
                {counts.pending}
              </strong>{" "}
              pending review ·{" "}
              <strong className="font-semibold text-foreground">
                {counts.approved}
              </strong>{" "}
              approved
            </>
          )
        }
        primary={
          latestDraft
            ? {
                label: "Continue Draft",
                to: `/employee/expenses/${latestDraft.id}`,
                icon: <FileText className="size-4" />,
              }
            : {
                label: "Submit Expense",
                to: "/employee/expenses/new",
                icon: <Plus className="size-4" />,
              }
        }
        secondary={{ label: "My Expenses", to: "/employee/expenses" }}
      />

      <EmployeeGettingStarted />

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
          <div className="no-print flex items-center justify-end">
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <MetricCard
              index={0}
              accent="violet"
              icon={FileText}
              label="Drafts"
              value={counts.draft}
              to="/employee/expenses"
            />
            <MetricCard
              index={1}
              accent="amber"
              icon={Clock}
              label="Pending Review"
              value={counts.pending}
              to="/employee/expenses"
            />
            <MetricCard
              index={2}
              accent="emerald"
              icon={CheckCircle2}
              label="Approved"
              value={counts.approved}
              to="/employee/expenses"
            />
            <MetricCard
              index={3}
              accent="rose"
              icon={XCircle}
              label="Rejected"
              value={counts.rejected}
              to="/employee/expenses"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <SectionCard
              title="Recent activity"
              description="Your latest expenses and their status."
              className="lg:col-span-2"
              actions={
                <Link
                  to="/employee/expenses"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  View all <ArrowRight className="size-3" />
                </Link>
              }
            >
              {recent.length === 0 ? (
                <EmptyState
                  compact
                  icon={Receipt}
                  title="No expenses yet"
                  description="Submit your first expense to get started."
                  action={
                    <Link
                      to="/employee/expenses/new"
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Submit an expense
                    </Link>
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y">
                  {recent.map((e) => (
                    <li key={e.id}>
                      <Link
                        to={`/employee/expenses/${e.id}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {e.description || "Untitled expense"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatMoney(e.amount, e.currency)} ·{" "}
                            {formatDate(e.expenseDate)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <CreationMethodBadge method={e.creationMethod} />
                          <ApprovalStatusBadge status={e.approvalStatus} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Quick actions"
              description="Jump straight to what you need."
            >
              <div className="flex flex-col gap-2">
                <QuickAction
                  to="/employee/expenses/new"
                  icon={<FilePlus2 className="size-4" />}
                  label="Submit Expense"
                  hint="Upload a receipt or enter manually"
                />
                <QuickAction
                  to="/employee/expenses"
                  icon={<FileText className="size-4" />}
                  label="View Drafts"
                  hint={`${counts.draft} unfinished`}
                />
                <QuickAction
                  to="/employee/tasks"
                  icon={<ClipboardList className="size-4" />}
                  label="My Tasks"
                  hint="Work assigned to you"
                />
                <QuickAction
                  to="/employee/helpdesk"
                  icon={<LifeBuoy className="size-4" />}
                  label="New Ticket"
                  hint="Raise a support request"
                />
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <MyTasksWidget />
            <TicketsWidget basePath="/employee" title="My tickets" />
          </div>
        </div>
      )}
    </>
  );
}

function QuickAction({
  to,
  icon,
  label,
  hint,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border border-border/70 p-3 transition hover:border-primary/40 hover:bg-muted/50"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
