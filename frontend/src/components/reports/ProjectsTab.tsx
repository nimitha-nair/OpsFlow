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
import { KpiCard } from "./report-ui";
import { riseStyle } from "./report-palette";
import { SectionCard } from "../common/SectionCard";
import { MoneyTotals } from "../common/MoneyTotals";
import { CurrencyScope } from "./CurrencyScope";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { formatMoney } from "../../lib/format";
import { getReportsProjects } from "../../lib/reports-api";
import type { ProjectReportRow, ProjectsReport } from "../../types/reports";

type Sort = "spend" | "utilization";
const ERROR_MSG = "We couldn't load the project analytics. Please try again.";

/** Gradient fill + label by utilization band: >100 over-budget, ≥80 near-limit. */
function utilBand(util: number | null): { tone: string; badge: string | null } {
  if (util === null)
    return { tone: "from-slate-400 to-slate-500", badge: null };
  if (util > 100)
    return { tone: "from-rose-500 to-red-500", badge: "Over budget" };
  if (util >= 80)
    return { tone: "from-amber-500 to-orange-500", badge: "Near limit" };
  return { tone: "from-emerald-500 to-teal-500", badge: null };
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

export function ProjectsTab({ currency: controlledCurrency }: { currency?: string } = {}) {
  // Filter-controlled when `currency` is supplied (Reports currency filter drives
  // it): scopes to that currency and hides its own picker + toolbar.
  const controlled = controlledCurrency !== undefined;
  const [data, setData] = useState<ProjectsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("spend");
  // Group-by-currency: undefined = auto (dominant currency). Project spend vs
  // budget is only meaningful within a single currency.
  const [currency, setCurrency] = useState<string | undefined>(controlledCurrency);
  const effectiveCurrency = controlled ? controlledCurrency : currency;

  const fetchProjects = useCallback(async (cur?: string) => {
    try {
      setData(await getReportsProjects({ currency: cur }));
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsProjects({ currency: effectiveCurrency });
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
    // Controlled instances refetch when their assigned currency changes.
  }, [effectiveCurrency]);

  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    setRefreshing(true);
    void fetchProjects(cur).finally(() => setRefreshing(false));
  };
  const onRefresh = () => {
    setRefreshing(true);
    void fetchProjects(currency).finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchProjects(currency).finally(() => setLoading(false));
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
  // For projects without a budget (utilization n/a) we show spend relative to
  // the highest-spending project so the bar still has length.
  const maxSpent = Math.max(1, ...rows.map((r) => r.totalSpent));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved spend across {totals.projectCount} project
          {totals.projectCount === 1 ? "" : "s"}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={sort} onValueChange={(v) => v && setSort(v as Sort)}>
            <SelectTrigger size="sm" className="w-full min-w-40 flex-1 sm:w-48 sm:flex-none" aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="spend">Highest spend</SelectItem>
              <SelectItem value="utilization">Highest utilization</SelectItem>
            </SelectContent>
          </Select>
          {!controlled && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {!controlled && (
        <CurrencyScope
          totals={data.currencies}
          selected={[data.activeCurrency]}
          onChange={(next) => changeCurrency(next[next.length - 1] ?? data.activeCurrency)}
        />
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <KpiCard
          index={0}
          accent="indigo"
          label="Projects"
          value={totals.projectCount}
          icon={FolderKanban}
        />
        <KpiCard
          index={1}
          accent="sky"
          label="Total budget"
          value={formatMoney(totals.budget, data.activeCurrency)}
          icon={Wallet}
        />
        <KpiCard
          index={2}
          accent="violet"
          label="Total spent"
          value={<MoneyTotals totals={totals.spentByCurrency} compact />}
          icon={TrendingUp}
          hint={`${formatMoney(totals.remaining, data.activeCurrency)} remaining vs budget`}
        />
        <KpiCard
          index={3}
          accent="amber"
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
            {rows.map((p, i) => (
              <ProjectRow
                key={p.projectId}
                project={p}
                currency={data.activeCurrency}
                index={i}
                maxSpent={maxSpent}
              />
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
  index = 0,
  maxSpent = 1,
}: {
  project: ProjectReportRow;
  currency: string;
  index?: number;
  maxSpent?: number;
}) {
  const band = utilBand(p.utilization);
  // With a budget, the bar shows utilization %. Without one, fall back to spend
  // relative to the top spender so the bar isn't permanently empty.
  const barWidth =
    p.utilization === null
      ? Math.min(100, (p.totalSpent / maxSpent) * 100)
      : Math.min(100, p.utilization);
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
        <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums text-muted-foreground">
          <MoneyTotals
            totals={p.spentByCurrency}
            compact
            layout="inline"
            className="font-medium text-foreground"
          />
          {p.hasBudget ? ` / ${formatMoney(p.budget, currency)}` : " · no budget"}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/70">
        <div
          className={`r-bar h-full rounded-full bg-gradient-to-r ${band.tone}`}
          style={{ width: `${barWidth}%`, ...riseStyle(index) }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {p.utilization === null
            ? "Utilization n/a"
            : `${p.utilization}% utilized`}
          {/* Budget comparison is single-currency; flag when there's more. */}
          {p.spentByCurrency.length > 1 && ` · in ${currency}`}
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
