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
import { BarList, ColumnChart, DonutChart } from "./charts";
import { CurrencyScope } from "./CurrencyScope";
import { paletteAt } from "./report-palette";
import { formatCompactMoney, formatDate, formatMoney } from "../../lib/format";
import { monthsToParams } from "../../lib/date-range";
import { monthAxisLabel, monthFull } from "../../lib/month-format";
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

export function ExpensesTab({ currency: controlledCurrency }: { currency?: string } = {}) {
  // When `currency` is supplied the tab is filter-controlled (the Reports
  // currency filter drives it): it scopes to that currency and hides its own
  // currency picker + toolbar so one instance renders per selected currency.
  const controlled = controlledCurrency !== undefined;
  const [months, setMonths] = useState(12);
  // Group-by-currency: undefined = auto (dominant currency in range).
  const [currency, setCurrency] = useState<string | undefined>(controlledCurrency);
  const effectiveCurrency = controlled ? controlledCurrency : currency;
  const [data, setData] = useState<ExpensesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Used by the event handlers (range change / refresh / retry); sets data/error
  // only after the await.
  const fetchExpenses = useCallback(async (m: number, cur?: string) => {
    try {
      setData(await getReportsExpenses({ ...monthsToParams(m), currency: cur }));
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsExpenses({
          ...monthsToParams(12),
          currency: effectiveCurrency,
        });
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

  const changeMonths = (m: number) => {
    setMonths(m);
    setRefreshing(true);
    void fetchExpenses(m, currency).finally(() => setRefreshing(false));
  };
  const changeCurrency = (cur: string) => {
    setCurrency(cur);
    setRefreshing(true);
    void fetchExpenses(months, cur).finally(() => setRefreshing(false));
  };
  const onRefresh = () => {
    setRefreshing(true);
    void fetchExpenses(months, currency).finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchExpenses(months, currency).finally(() => setLoading(false));
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
        {!controlled && (
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
        )}
      </div>

      {!controlled && (
        <CurrencyScope
          totals={data.currencies}
          selected={[data.activeCurrency]}
          onChange={(next) => changeCurrency(next[next.length - 1] ?? data.activeCurrency)}
        />
      )}

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
            <CategoryBars data={data.spendByCategory} currency={data.activeCurrency} />
          </SectionCard>

          <SectionCard title="Project vs General" description="Approved spend split">
            <ScopeDonut data={data.byScope} currency={data.activeCurrency} />
          </SectionCard>

          <SectionCard
            title={`Monthly trend · last ${data.range.months} months`}
            description="Approved spend per month"
            className="lg:col-span-2"
          >
            <MonthlyColumns data={data.monthlyTrend} currency={data.activeCurrency} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function CategoryBars({ data, currency }: { data: CategorySpend[]; currency: string }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <BarList
      items={data.map((d, i) => ({
        label: categoryLabel(d.category),
        valueText: `${formatMoney(d.amount, currency)} · ${d.count}`,
        ratio: d.amount / max,
        tone: paletteAt(i),
      }))}
    />
  );
}

function ScopeDonut({ data, currency }: { data: ScopeSplit; currency: string }) {
  const total = data.project + data.general;
  return (
    <DonutChart
      segments={[
        { label: `Project · ${data.projectCount}`, value: data.project, accent: "indigo" },
        { label: `General · ${data.generalCount}`, value: data.general, accent: "sky" },
      ]}
      centerValue={formatCompactMoney(total, currency)}
      centerLabel="approved"
      formatValue={(v) => formatMoney(v, currency)}
      emptyLabel="No approved spend to split yet."
    />
  );
}

function MonthlyColumns({ data, currency }: { data: MonthlySpend[]; currency: string }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <ColumnChart
      items={data.map((m, i) => ({
        key: m.month,
        ratio: m.amount / max,
        // Year shown only at year boundaries (see month-format); full month in the tooltip.
        label: monthAxisLabel(m.month, i > 0 ? data[i - 1]!.month : undefined),
        valueText: formatMoney(m.amount, currency),
        title: `${monthFull(m.month)} · ${formatMoney(m.amount, currency)} · ${m.count} expense${m.count === 1 ? "" : "s"}`,
      }))}
    />
  );
}
