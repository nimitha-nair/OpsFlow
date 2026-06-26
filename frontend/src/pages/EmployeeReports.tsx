import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, CheckCircle2, Clock, FileText, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../components/common/DateRangeFilter";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { MetricCard } from "../components/common/MetricCard";
import { MoneyTotals } from "../components/common/MoneyTotals";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { BarList, ColumnChart } from "../components/reports/charts";
import { CurrencyScope } from "../components/reports/CurrencyScope";
import { ExpenseDetailTable } from "../components/reports/ExpenseDetailTable";
import { PerCurrencySections } from "../components/reports/PerCurrencySections";
import { paletteAt } from "../components/reports/report-palette";
import { normalizeCurrency, totalsByCurrency } from "../lib/currency";
import {
  makeRange,
  rangeLabel,
  rangeSlug,
  rangeToParams,
  type DateRange,
} from "../lib/date-range";
import { downloadCsv, printElement } from "../lib/export";
import { apiErrorMessage, listMyExpenses } from "../lib/expenses-api";
import { formatDate, formatDateTime, formatMoney } from "../lib/format";
import { monthAxisLabel, monthFull } from "../lib/month-format";
import {
  APPROVAL_LABELS,
  CATEGORY_LABELS,
  REIMBURSEMENT_LABELS,
  type Expense,
} from "../types/expense";

const PENDING = ["SUBMITTED", "PENDING_REVIEW"];

/** Inclusive list of "YYYY-MM" keys from `first` to `last` (continuous axis). */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number) as [number, number];
  const [ly, lm] = last.split("-").map(Number) as [number, number];
  // Guard against bad input producing an unbounded loop.
  let guard = 0;
  while ((y < ly || (y === ly && m <= lm)) && guard < 600) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

/** A personal expense report for the signed-in employee. */
export function EmployeeReports() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  // Multi-currency: `null` = default (all present); an array = explicit pick.
  // One → current layout; several → one section per currency, never combined.
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[] | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const currencyTotals = useMemo(() => totalsByCurrency(expenses), [expenses]);
  const allCurrencies = currencyTotals.map((t) => t.currency);
  const picked = selectedCurrencies?.filter((c) => allCurrencies.includes(c)) ?? null;
  const renderCurrencies = picked && picked.length > 0 ? picked : allCurrencies;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const mine = await listMyExpenses(rangeToParams(range));
        if (!cancelled) setExpenses(mine);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load report."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range]);

  // Build the report for ONE currency (each rendered section is single-currency).
  const buildReport = useCallback(
    (currency: string) => {
    const inCur = expenses.filter((e) => normalizeCurrency(e.currency) === currency);
    const counts = { draft: 0, pending: 0, approved: 0, rejected: 0 };
    for (const e of inCur) {
      if (e.approvalStatus === "DRAFT") counts.draft += 1;
      else if (PENDING.includes(e.approvalStatus)) counts.pending += 1;
      else if (e.approvalStatus === "REJECTED") counts.rejected += 1;
      else if (e.approvalStatus === "APPROVED") counts.approved += 1;
    }
    const approved = inCur.filter((e) => e.approvalStatus === "APPROVED");
    const approvedByCurrency = totalsByCurrency(approved);
    const reimbursedByCurrency = totalsByCurrency(
      approved.filter((e) => e.reimbursementStatus === "PAID"),
    );

    let approvedSpend = 0;
    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const scoped = approved;
    for (const e of scoped) {
      approvedSpend += e.amount;
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
      const month = (e.expenseDate ?? "").slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) ?? 0) + e.amount);
    }

    const catItems = [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amount], i) => ({
        label: CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat,
        valueText: formatMoney(amount, currency),
        ratio: approvedSpend > 0 ? amount / approvedSpend : 0,
        tone: paletteAt(i),
      }));

    // Continuous month axis, one bucket per month with gaps zero-filled (capped
    // to 24). For a bounded date range, span the FULL range (incl. leading/
    // trailing zero months) so the timeline is complete; for the unbounded "All"
    // preset, span the first→last month that actually has approved spend.
    const dataMonths = [...byMonth.keys()].sort();
    const params = rangeToParams(range);
    const rangeFrom = params.from?.slice(0, 7);
    const rangeTo = params.to?.slice(0, 7);
    const axisStart = rangeFrom ?? dataMonths[0];
    const axisEnd = rangeTo ?? dataMonths[dataMonths.length - 1];
    let trendItems: {
      key: string;
      ratio: number;
      label: string;
      title: string;
      valueText: string;
    }[] = [];
    if (axisStart && axisEnd && axisStart <= axisEnd) {
      const full = monthRange(axisStart, axisEnd);
      const axis = full.length > 24 ? full.slice(-24) : full;
      const maxMonth = Math.max(1, ...axis.map((m) => byMonth.get(m) ?? 0));
      trendItems = axis.map((m, i) => {
        const amount = byMonth.get(m) ?? 0;
        return {
          key: m,
          ratio: amount / maxMonth,
          label: monthAxisLabel(m, i > 0 ? axis[i - 1] : undefined),
          valueText: formatMoney(amount, currency),
          title: `${monthFull(m)} · ${formatMoney(amount, currency)}`,
        };
      });
    }

    return {
      counts,
      approvedByCurrency,
      reimbursedByCurrency,
      currency,
      catItems,
      trendItems,
    };
    },
    [expenses, range],
  );

  function exportCsv() {
    downloadCsv(`my-expenses-${rangeSlug(range)}`, expenses, [
      { label: "Code", value: (e) => e.code ?? "" },
      { label: "Expense Date", value: (e) => formatDate(e.expenseDate) },
      { label: "Submitted", value: (e) => (e.submittedAt ? formatDate(e.submittedAt) : "") },
      { label: "Category", value: (e) => CATEGORY_LABELS[e.category] },
      { label: "Description", value: (e) => e.description ?? "" },
      { label: "Amount", value: (e) => e.amount },
      { label: "Currency", value: (e) => e.currency },
      { label: "Approval", value: (e) => APPROVAL_LABELS[e.approvalStatus] },
      {
        label: "Reimbursement",
        value: (e) => REIMBURSEMENT_LABELS[e.reimbursementStatus],
      },
    ]);
  }

  function exportPdf() {
    printElement(reportRef.current, `my-expense-report-${rangeSlug(range)}`);
  }

  const hasData = !loading && !error && expenses.length > 0;

  return (
    <>
      <PageHeader
        title="My Reports"
        description="A summary of your expenses and approved spend."
        breadcrumbs={[
          { label: "Employee", to: "/employee" },
          { label: "Reports" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActiveRangeBadge range={range} />
            <DateRangeFilter value={range} onChange={setRange} />
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={!hasData}
            >
              <Download className="size-4" />
              CSV
            </Button>
            <Button size="sm" onClick={exportPdf} disabled={!hasData}>
              <FileText className="size-4" />
              Export PDF
            </Button>
          </div>
        }
      />

      <div ref={reportRef} className="flex flex-col gap-6">
        {/* Print-only report header (hidden on screen, shown in the PDF). */}
        <div className="hidden print:block">
          <h1 className="text-xl font-semibold text-foreground">
            My Expense Report
          </h1>
          <p className="text-xs text-muted-foreground">
            {rangeLabel(range)} · generated{" "}
            {formatDateTime(new Date().toISOString())}
          </p>
        </div>

        {loading ? (
        <LoadingState label="Loading report…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load report"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : expenses.length === 0 ? (
        <SectionCard title="My Reports" description={rangeLabel(range)}>
          <EmptyState
            compact
            icon={Wallet}
            title="No expenses in range"
            description="Submit expenses to see your spend summary here."
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-6">
          <CurrencyScope
            totals={currencyTotals}
            selected={renderCurrencies}
            onChange={setSelectedCurrencies}
          />
          <PerCurrencySections currencies={renderCurrencies}>
            {(c) => {
              const report = buildReport(c);
              return (
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                    <MetricCard
                      index={0}
                      emphasize
                      accent="indigo"
                      icon={Wallet}
                      label="Approved Spend"
                      value={<MoneyTotals totals={report.approvedByCurrency} compact />}
                      hint={`${report.counts.approved} approved`}
                    />
                    <MetricCard
                      index={1}
                      accent="amber"
                      icon={Clock}
                      label="Pending Review"
                      value={report.counts.pending}
                    />
                    <MetricCard
                      index={2}
                      accent="emerald"
                      icon={CheckCircle2}
                      label="Reimbursed"
                      value={<MoneyTotals totals={report.reimbursedByCurrency} compact />}
                    />
                    <MetricCard
                      index={3}
                      accent="violet"
                      icon={FileText}
                      label="Drafts"
                      value={report.counts.draft}
                      hint={
                        report.counts.rejected > 0
                          ? `${report.counts.rejected} rejected`
                          : undefined
                      }
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <SectionCard
                      title="Approved spend by category"
                      description={rangeLabel(range)}
                    >
                      {report.catItems.length > 0 ? (
                        <BarList items={report.catItems} />
                      ) : (
                        <EmptyState
                          compact
                          icon={Wallet}
                          title="No approved spend yet"
                          description="Approved expenses appear here once reviewed."
                        />
                      )}
                    </SectionCard>

                    <SectionCard title="Spend trend" description="Approved spend by month">
                      {report.trendItems.length > 0 ? (
                        <ColumnChart items={report.trendItems} />
                      ) : (
                        <EmptyState
                          compact
                          icon={CheckCircle2}
                          title="No trend yet"
                          description="The trend builds as your expenses are approved."
                        />
                      )}
                    </SectionCard>
                  </div>

                  {report.counts.rejected > 0 && (
                    <SectionCard title="Outcomes" description={rangeLabel(range)}>
                      <BarList
                        items={[
                          {
                            label: "Approved",
                            valueText: String(report.counts.approved),
                            ratio:
                              report.counts.approved /
                              Math.max(1, report.counts.approved + report.counts.rejected),
                            tone: "from-emerald-500 to-teal-500",
                          },
                          {
                            label: "Rejected",
                            valueText: String(report.counts.rejected),
                            ratio:
                              report.counts.rejected /
                              Math.max(1, report.counts.approved + report.counts.rejected),
                            tone: "from-rose-500 to-pink-500",
                          },
                        ]}
                      />
                    </SectionCard>
                  )}
                </div>
              );
            }}
          </PerCurrencySections>

          {/* Print-only: every expense by currency, included in the PDF export. */}
          <ExpenseDetailTable expenses={expenses} scope="employee" />
        </div>
      )}
      </div>
    </>
  );
}
