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
import { BarList, ColumnChart } from "./charts";
import { paletteAt } from "./report-palette";
import { formatDate, formatMoney } from "../../lib/format";
import { monthsToParams } from "../../lib/date-range";
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

/** Label a "YYYY-MM" key; `year` adds the year ("2-digit" → "Jun 26",
 *  "numeric" → "Jun 2026") so months in different years stay distinct. */
function monthLabel(key: string, year?: "2-digit" | "numeric"): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString(
    "en-US",
    year ? { month: "short", year } : { month: "short" },
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
      setData(await getReportsExpenses(monthsToParams(m)));
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsExpenses(monthsToParams(12));
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

  // Show the analytics grid when EITHER the category breakdown OR the monthly
  // trend has data — they're computed independently, so a missing category must
  // not hide the trend (and vice versa). Each chart shows its own placeholder
  // when its specific series is empty.
  const hasCategory = data.spendByCategory.length > 0;
  const hasMonthly = data.monthlyTrend.some((m) => m.amount > 0);
  const isEmpty = !hasCategory && !hasMonthly;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved spend · {formatDate(data.range.from)} – {formatDate(data.range.to)}
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            value={String(months)}
            onValueChange={(v) => v && changeMonths(Number(v))}
            disabled={refreshing}
          >
            <SelectTrigger size="sm" className="w-full min-w-32 flex-1 sm:w-40 sm:flex-none" aria-label="Time range">
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
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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
    <BarList
      items={data.map((d, i) => ({
        label: categoryLabel(d.category),
        valueText: `${formatMoney(d.amount)} · ${d.count}`,
        ratio: d.amount / max,
        tone: paletteAt(i),
      }))}
    />
  );
}

function ScopeBars({ data }: { data: ScopeSplit }) {
  const total = data.project + data.general;
  const max = Math.max(1, data.project, data.general);
  const pct = (amount: number) =>
    total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <BarList
      items={[
        {
          label: `Project · ${pct(data.project)}%`,
          valueText: `${formatMoney(data.project)} · ${data.projectCount}`,
          ratio: data.project / max,
          tone: "from-indigo-500 to-violet-500",
        },
        {
          label: `General · ${pct(data.general)}%`,
          valueText: `${formatMoney(data.general)} · ${data.generalCount}`,
          ratio: data.general / max,
          tone: "from-sky-500 to-blue-500",
        },
      ]}
    />
  );
}

function MonthlyColumns({ data }: { data: MonthlySpend[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  // Show the year on axis labels only when the trend spans calendar years.
  const spansYears =
    data.length > 1 &&
    data[0]!.month.slice(0, 4) !== data[data.length - 1]!.month.slice(0, 4);
  return (
    <ColumnChart
      items={data.map((m) => ({
        key: m.month,
        ratio: m.amount / max,
        label: monthLabel(m.month, spansYears ? "2-digit" : undefined),
        title: `${monthLabel(m.month, "numeric")} · ${formatMoney(m.amount)} · ${m.count} expense${m.count === 1 ? "" : "s"}`,
      }))}
    />
  );
}
