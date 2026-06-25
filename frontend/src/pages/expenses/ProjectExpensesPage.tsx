import { useEffect, useMemo, useState } from "react";
import { Banknote, Briefcase, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatCard } from "../../components/dashboard/StatCard";
import { ProjectStatusBadge } from "../../components/projects/ProjectStatusBadge";
import { formatMoney } from "../../lib/format";
import { apiErrorMessage, listProjectsSpending } from "../../lib/expenses-api";
import {
  utilizationState,
  type ProjectSpendingSummary,
  type UtilizationState,
} from "../../types/expense";
import type { ProjectStatus } from "../../types/project";

const BAR_COLOR: Record<UtilizationState, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};
const TEXT_COLOR: Record<UtilizationState, string> = {
  healthy: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-400",
};
const STATE_LABEL: Record<UtilizationState, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

function ProjectSpendCard({
  p,
  maxSpent,
}: {
  p: ProjectSpendingSummary;
  maxSpent: number;
}) {
  const pct = Math.round(p.utilization);
  const state = utilizationState(p.utilization);
  const hasBudget = p.budget > 0;
  // With a budget, the bar tracks utilization. Without one, utilization is
  // always 0, so show spend relative to the top spender — otherwise the bar is
  // permanently empty even when money has been spent.
  const rawPct = hasBudget
    ? p.utilization
    : (p.totalSpent / maxSpent) * 100;
  // Any non-zero spend gets a visible minimum sliver so a tiny utilization
  // (e.g. ₹100 of a ₹50k budget = 0.2%) doesn't render as an empty bar.
  const barWidth =
    p.totalSpent > 0 ? Math.min(100, Math.max(rawPct, 2)) : 0;
  // Show "<1%" rather than a misleading "0%" when there is real but tiny spend.
  const pctLabel =
    p.utilization > 0 && p.utilization < 1 ? "<1%" : `${pct}%`;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
            {p.projectName}
          </h3>
          <ProjectStatusBadge status={p.status as ProjectStatus} />
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              "text-lg font-semibold tabular-nums",
              hasBudget ? TEXT_COLOR[state] : "text-muted-foreground",
            )}
          >
            {hasBudget ? pctLabel : "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {hasBudget ? STATE_LABEL[state] : "No budget"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              hasBudget ? BAR_COLOR[state] : "bg-sky-500",
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Budget</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatMoney(p.budget, p.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Spent</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatMoney(p.totalSpent, p.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Remaining</dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                p.remaining < 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
              )}
            >
              {formatMoney(p.remaining, p.currency)}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

export function ProjectExpensesPage() {
  const [rows, setRows] = useState<ProjectSpendingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listProjectsSpending();
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load spending."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const totals = useMemo(() => {
    const currency = rows[0]?.currency ?? "INR";
    return {
      currency,
      projects: rows.length,
      budget: rows.reduce((s, p) => s + p.budget, 0),
      spent: rows.reduce((s, p) => s + p.totalSpent, 0),
      remaining: rows.reduce((s, p) => s + p.remaining, 0),
    };
  }, [rows]);

  const maxSpent = Math.max(1, ...rows.map((r) => r.totalSpent));

  return (
    <>
      <PageHeader
        title="Project Spending"
        description="Approved expenses against project budgets."
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Expenses", to: "/admin/expenses" },
          { label: "Project Spending" },
        ]}
      />

      {error ? (
        <Card className="p-6">
          <ErrorState
            title="Couldn't load spending"
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </Card>
      ) : loading ? (
        <Card className="p-6">
          <LoadingState label="Loading spending…" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Briefcase}
            title="No projects yet"
            description="Create a project to start tracking spending."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Projects" value={totals.projects} icon={Briefcase} />
            <StatCard
              label="Total Budget"
              value={formatMoney(totals.budget, totals.currency)}
              icon={Banknote}
            />
            <StatCard
              label="Total Approved Spend"
              value={formatMoney(totals.spent, totals.currency)}
              icon={Wallet}
            />
            <StatCard
              label="Total Remaining"
              value={formatMoney(totals.remaining, totals.currency)}
              icon={TrendingUp}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((p) => (
              <ProjectSpendCard key={p.projectId} p={p} maxSpent={maxSpent} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
