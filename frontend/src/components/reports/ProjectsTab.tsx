import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  FolderKanban,
  RefreshCw,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "../dashboard/StatCard";
import { SectionCard } from "../common/SectionCard";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { formatMoney } from "../../lib/format";
import { getReportsProjects } from "../../lib/reports-api";
import type { ProjectReportRow, ProjectsReport } from "../../types/reports";

type Sort = "spend" | "utilization";
const ERROR_MSG = "We couldn't load the project analytics. Please try again.";

/** Bar tone + label by utilization band: >100 over-budget (red), ≥80 near-limit (amber). */
function utilBand(util: number | null): { tone: string; badge: string | null } {
  if (util === null) return { tone: "bg-muted-foreground/40", badge: null };
  if (util > 100) return { tone: "bg-red-500/80", badge: "Over budget" };
  if (util >= 80) return { tone: "bg-amber-500/80", badge: "Near limit" };
  return { tone: "bg-emerald-500/70", badge: null };
}

function sortRows(rows: ProjectReportRow[], sort: Sort): ProjectReportRow[] {
  const copy = [...rows];
  if (sort === "utilization") {
    // Highest utilization first; projects without a budget (null) go last.
    copy.sort((a, b) => {
      if (a.utilization === null && b.utilization === null) return 0;
      if (a.utilization === null) return 1;
      if (b.utilization === null) return -1;
      return b.utilization - a.utilization;
    });
  } else {
    copy.sort((a, b) => b.totalSpent - a.totalSpent);
  }
  return copy;
}

export function ProjectsTab() {
  const [data, setData] = useState<ProjectsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("spend");

  const fetchProjects = useCallback(async () => {
    try {
      setData(await getReportsProjects());
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsProjects();
        if (!cancelled) {
          setData(r);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(ERROR_MSG);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchProjects().finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchProjects().finally(() => setLoading(false));
  };

  if (loading) return <LoadingState label="Loading project analytics…" />;
  if (error)
    return (
      <ErrorState
        title="Couldn't load analytics"
        description={error}
        onRetry={onRetry}
      />
    );
  if (!data) return null;

  const { totals } = data;
  const rows = sortRows(data.projects, sort);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved spend across {totals.projectCount} project
          {totals.projectCount === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <SelectTrigger size="sm" className="w-48" aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Highest spend</SelectItem>
              <SelectItem value="utilization">Highest utilization</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Projects" value={totals.projectCount} icon={FolderKanban} />
        <StatCard
          label="Total budget"
          value={formatMoney(totals.budget, data.currency)}
          icon={Wallet}
        />
        <StatCard
          label="Total spent"
          value={formatMoney(totals.spent, data.currency)}
          icon={TrendingUp}
          hint={`${formatMoney(totals.remaining, data.currency)} remaining`}
        />
        <StatCard
          label="Over / near budget"
          value={`${totals.overBudgetCount} / ${totals.nearLimitCount}`}
          icon={AlertTriangle}
          hint=">100% / ≥80% utilization"
        />
      </div>

      <SectionCard
        title="Project spend vs budget"
        description="Approved spend against each project's budget"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Project analytics will appear once projects exist."
          />
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((p) => (
              <ProjectRow key={p.projectId} project={p} currency={data.currency} />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function ProjectRow({
  project: p,
  currency,
}: {
  project: ProjectReportRow;
  currency: string;
}) {
  const band = utilBand(p.utilization);
  const barWidth = p.utilization === null ? 0 : Math.min(100, p.utilization);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">
            {p.projectName}
          </span>
          {p.archived && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              Archived
            </span>
          )}
          {band.badge && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                p.utilization! > 100
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {band.badge}
            </span>
          )}
        </div>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {formatMoney(p.totalSpent, currency)}
          {p.hasBudget ? ` / ${formatMoney(p.budget, currency)}` : " · no budget"}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${band.tone} transition-all`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {p.utilization === null
            ? "Utilization n/a"
            : `${p.utilization}% utilized`}
        </span>
        <span>
          {p.remaining === null
            ? `${p.expenseCount} expense${p.expenseCount === 1 ? "" : "s"}`
            : `${formatMoney(p.remaining, currency)} remaining`}
        </span>
      </div>
    </li>
  );
}
