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
import {
  BarList,
  ColumnChart,
  CurrencyLegend,
  DonutChart,
  GroupedBarList,
  GroupedColumnChart,
} from "./charts";
import type { GroupedBarRow, GroupedColumnItem } from "./charts";
import { CurrencyScope } from "./CurrencyScope";
import { currencyAccents } from "../common/accent";
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

/* --------------------- Combined multi-currency analytics --------------------- */

/**
 * Expense analytics for the Reports currency filter. With one currency it
 * renders the classic single-currency tab; with several it renders ONE combined
 * view — colour-coded grouped bars/columns and a small-multiple donut per
 * currency — instead of stacking a full tab per currency. Money is never summed
 * across currencies; each currency keeps its own colour and scale.
 */
export function ExpensesAnalytics({ currencies }: { currencies: string[] }) {
  if (currencies.length <= 1) {
    return <ExpensesTab currency={currencies[0] ?? "INR"} />;
  }
  return <ExpensesTabCombined currencies={currencies} />;
}

function ExpensesTabCombined({ currencies }: { currencies: string[] }) {
  const [months, setMonths] = useState(12);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Record<string, ExpensesReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    async (m: number) => {
      const entries = await Promise.all(
        currencies.map(
          async (cur) =>
            [cur, await getReportsExpenses({ ...monthsToParams(m), currency: cur })] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, ExpensesReport>;
    },
    [currencies],
  );

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    fetchAll(months)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(ERROR_MSG);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAll, months, reloadKey]);

  if (loading) return <LoadingState label="Loading expense analytics…" />;
  if (error)
    return (
      <ErrorState
        title="Couldn't load analytics"
        description={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  if (!data) return null;

  const accents = currencyAccents(currencies);
  // Render only currencies whose data has actually loaded. When the selection
  // changes (e.g. 2 → 3) the per-currency fetch resolves a tick later, so `data`
  // may not yet hold every selected currency — filtering here avoids indexing an
  // absent key (which previously crashed with "reading 'spendByCategory'"). This
  // is also resilient to any new currency added to the selection later.
  const present = currencies.filter((cur) => data[cur]);
  if (present.length === 0) {
    return <LoadingState label="Loading expense analytics…" />;
  }

  // Categories ordered by combined size (for row order only — never summed into
  // a displayed total); each currency normalised to its own max bar.
  const catTotals = new Map<string, number>();
  for (const cur of present) {
    for (const cs of data[cur]!.spendByCategory) {
      catTotals.set(cs.category, (catTotals.get(cs.category) ?? 0) + cs.amount);
    }
  }
  const orderedCats = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);
  const maxCatByCur: Record<string, number> = {};
  for (const cur of present) {
    maxCatByCur[cur] = Math.max(1, ...data[cur]!.spendByCategory.map((c) => c.amount));
  }
  const categoryRows: GroupedBarRow[] = orderedCats
    .map((cat) => ({
      label: categoryLabel(cat),
      bars: present.flatMap((cur) => {
        const cs = data[cur]!.spendByCategory.find((c) => c.category === cat);
        const amount = cs?.amount ?? 0;
        if (amount <= 0) return [];
        return [
          {
            seriesKey: cur,
            accent: accents[cur]!,
            ratio: amount / maxCatByCur[cur]!,
            valueText: formatMoney(amount, cur),
          },
        ];
      }),
    }))
    .filter((r) => r.bars.length > 0);

  // Monthly trend: shared month axis (same range), one column per currency.
  const maxMonthByCur: Record<string, number> = {};
  for (const cur of present) {
    maxMonthByCur[cur] = Math.max(1, ...data[cur]!.monthlyTrend.map((m) => m.amount));
  }
  const axis = data[present[0]!]!.monthlyTrend;
  const monthlyItems: GroupedColumnItem[] = axis.map((m, i) => ({
    key: m.month,
    label: monthAxisLabel(m.month, i > 0 ? axis[i - 1]!.month : undefined),
    columns: present.map((cur) => {
      const mm = data[cur]!.monthlyTrend.find((x) => x.month === m.month);
      const amount = mm?.amount ?? 0;
      return {
        seriesKey: cur,
        accent: accents[cur]!,
        ratio: amount / maxMonthByCur[cur]!,
        title: `${cur} · ${monthFull(m.month)} · ${formatMoney(amount, cur)}`,
      };
    }),
  }));

  const hasCategory = categoryRows.length > 0;
  const hasMonthly = monthlyItems.some((it) => it.columns.some((c) => c.ratio > 0));
  const isEmpty = !hasCategory && !hasMonthly;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved spend · last {months} months · each currency shown separately
        </p>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            value={String(months)}
            onValueChange={(v) => v && setMonths(Number(v))}
            disabled={refreshing}
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-32 flex-1 sm:w-40 sm:flex-none"
              aria-label="Time range"
            >
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
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={refreshing}
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <CurrencyLegend currencies={present} />

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
            description="Approved spend per currency, highest first"
          >
            <GroupedBarList rows={categoryRows} />
          </SectionCard>

          <SectionCard title="Project vs General" description="Approved spend split, per currency">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {present.map((cur) => (
                <div key={cur} className="flex flex-col gap-2">
                  <span className="self-start rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold tracking-wide text-primary">
                    {cur}
                  </span>
                  <ScopeDonut data={data[cur]!.byScope} currency={cur} />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={`Monthly trend · last ${months} months`}
            description="Approved spend per month, per currency"
            className="lg:col-span-2"
          >
            <GroupedColumnChart items={monthlyItems} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
