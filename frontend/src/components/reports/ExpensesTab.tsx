import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "../common/SectionCard";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { formatDate, formatMoney } from "../../lib/format";
import { getReportsExpenses } from "../../lib/reports-api";
import { CATEGORY_LABELS, type ExpenseCategory } from "../../types/expense";
import type {
  CategorySpend,
  ExpensesReport,
  MonthlySpend,
  ScopeSplit,
} from "../../types/reports";

const MONTH_OPTIONS = [3, 6, 12, 24];
const ERROR_MSG = "We couldn't load the expense analytics. Please try again.";

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category as ExpenseCategory] ?? category;
}

/** "2026-06" → "Jun" (or "Jun 2026" with year). */
function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(
    "en-US",
    withYear ? { month: "short", year: "numeric" } : { month: "short" },
  );
}

export function ExpensesTab() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<ExpensesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Used by the event handlers (range change / refresh / retry); sets data/error
  // only after the await.
  const fetchExpenses = useCallback(async (m: number) => {
    try {
      setData(await getReportsExpenses(m));
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsExpenses(12);
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

  const changeMonths = (m: number) => {
    setMonths(m);
    setRefreshing(true);
    void fetchExpenses(m).finally(() => setRefreshing(false));
  };
  const onRefresh = () => {
    setRefreshing(true);
    void fetchExpenses(months).finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchExpenses(months).finally(() => setLoading(false));
  };

  if (loading) return <LoadingState label="Loading expense analytics…" />;
  if (error)
    return (
      <ErrorState
        title="Couldn't load analytics"
        description={error}
        onRetry={onRetry}
      />
    );
  if (!data) return null;

  const isEmpty = data.spendByCategory.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved spend · {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(months)}
            onValueChange={(v) => v && changeMonths(Number(v))}
            disabled={refreshing}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Time range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  Last {m} months
                </SelectItem>
              ))}
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

      {isEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="No approved expenses in this range"
          description="Try a longer range, or check back once expenses are approved."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard
            title="Spend by category"
            description="Approved spend, highest first"
          >
            <CategoryBars data={data.spendByCategory} />
          </SectionCard>

          <SectionCard title="Project vs General" description="Approved spend split">
            <ScopeBars data={data.byScope} />
          </SectionCard>

          <SectionCard
            title={`Monthly trend · last ${data.range.months} months`}
            description="Approved spend per month"
            className="lg:col-span-2"
          >
            <MonthlyColumns data={data.monthlyTrend} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function CategoryBars({ data }: { data: CategorySpend[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li key={d.category} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-foreground">
              {categoryLabel(d.category)}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatMoney(d.amount)} · {d.count}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${(d.amount / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ScopeBars({ data }: { data: ScopeSplit }) {
  const total = data.project + data.general;
  const max = Math.max(1, data.project, data.general);
  const rows = [
    { label: "Project", amount: data.project, count: data.projectCount, tone: "bg-primary/70" },
    { label: "General", amount: data.general, count: data.generalCount, tone: "bg-sky-500/70" },
  ];
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
        return (
          <li key={r.label} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">
                {r.label}{" "}
                <span className="text-muted-foreground">· {pct}%</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatMoney(r.amount)} · {r.count}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${r.tone}`}
                style={{ width: `${(r.amount / max) * 100}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MonthlyColumns({ data }: { data: MonthlySpend[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-44 items-end gap-1.5">
        {data.map((m) => {
          const pct = (m.amount / max) * 100;
          return (
            <div
              key={m.month}
              className="flex flex-1 items-end justify-center"
              title={`${monthLabel(m.month, true)} · ${formatMoney(m.amount)} · ${m.count} expense${m.count === 1 ? "" : "s"}`}
            >
              <div
                className="w-full rounded-t bg-primary/70 transition-all"
                style={{ height: `${m.amount > 0 ? Math.max(pct, 3) : 0}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {data.map((m) => (
          <div
            key={m.month}
            className="flex-1 truncate text-center text-[10px] text-muted-foreground"
          >
            {monthLabel(m.month)}
          </div>
        ))}
      </div>
    </div>
  );
}
