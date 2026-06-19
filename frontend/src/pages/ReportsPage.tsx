import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "../components/layout/PageHeader";
import { MetricCard } from "../components/common/MetricCard";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { ExpensesTab } from "../components/reports/ExpensesTab";
import { ProjectsTab } from "../components/reports/ProjectsTab";
import { AiAnalyticsTab } from "../components/reports/AiAnalyticsTab";
import { useAuth } from "../context/auth-context";
import { formatDateTime, formatMoney } from "../lib/format";
import { getReportsOverview } from "../lib/reports-api";
import type { OverviewKpis, OverviewReport } from "../types/reports";

interface TabDef {
  value: string;
  label: string;
  /** Built in this phase? Unbuilt tabs render a "coming soon" placeholder. */
  built: boolean;
}

/** Tab set per role (RBAC). Only Overview is built in Phase 1. */
const ADMIN_TABS: TabDef[] = [
  { value: "overview", label: "Overview", built: true },
  { value: "expenses", label: "Expenses", built: true },
  { value: "projects", label: "Projects", built: true },
  { value: "ai", label: "AI Analytics", built: true },
];
const HR_TABS: TabDef[] = ADMIN_TABS.filter(
  (t) => t.value === "overview" || t.value === "expenses",
);


export function ReportsPage() {
  const { user } = useAuth();
  const tabs = user?.role === "ADMIN" ? ADMIN_TABS : HR_TABS;
  const [tab, setTab] = useState("overview");

  const [data, setData] = useState<OverviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch + set data/error only AFTER the await. Used by the refresh/retry event
  // handlers (which own the loading/refreshing flags).
  const fetchOverview = useCallback(async () => {
    try {
      setData(await getReportsOverview());
      setError(null);
    } catch {
      setError("We couldn't load the reports. Please try again.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const report = await getReportsOverview();
        if (!cancelled) {
          setData(report);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("We couldn't load the reports. Please try again.");
        }
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
    void fetchOverview().finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchOverview().finally(() => setLoading(false));
  };

  return (
    <>
      <PageHeader
        title="Reports"
        description="Expense KPIs and analytics."
        breadcrumbs={[{ label: "Reports" }]}
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as string)}
        className="reports-scope"
      >
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            data={data}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={onRefresh}
            onRetry={onRetry}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <ExpensesTab />
        </TabsContent>

        {tabs.some((t) => t.value === "projects") && (
          <TabsContent value="projects" className="mt-6">
            <ProjectsTab />
          </TabsContent>
        )}

        {tabs.some((t) => t.value === "ai") && (
          <TabsContent value="ai" className="mt-6">
            <AiAnalyticsTab />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

function OverviewTab({
  data,
  loading,
  refreshing,
  error,
  onRefresh,
  onRetry,
}: {
  data: OverviewReport | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  if (loading) return <LoadingState label="Loading reports…" />;
  if (error)
    return (
      <ErrorState
        title="Couldn't load reports"
        description={error}
        onRetry={onRetry}
      />
    );
  if (!data) return null;

  const isEmpty = data.kpis.total.count === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Generated at {formatDateTime(data.generatedAt)}
        </p>
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

      {isEmpty ? (
        <EmptyState
          icon={BarChart3}
          title="No expense data yet"
          description="KPIs will appear here once expenses are submitted."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              index={0}
              emphasize
              accent="indigo"
              icon={Wallet}
              label="Total Spend (approved)"
              value={formatMoney(data.kpis.approved.amount, data.currency)}
              hint={`${data.kpis.approved.count} approved · ${formatMoney(
                data.kpis.total.amount,
                data.currency,
              )} submitted`}
            />
            <MetricCard
              index={1}
              accent="emerald"
              icon={CheckCircle2}
              label="Approved"
              value={data.kpis.approved.count}
              hint={formatMoney(data.kpis.approved.amount, data.currency)}
            />
            <MetricCard
              index={2}
              accent="amber"
              icon={Clock}
              label="Pending review"
              value={data.kpis.pending.count}
              hint={formatMoney(data.kpis.pending.amount, data.currency)}
            />
            <MetricCard
              index={3}
              accent="rose"
              icon={XCircle}
              label="Rejected"
              value={data.kpis.rejected.count}
              hint={formatMoney(data.kpis.rejected.amount, data.currency)}
            />
          </div>

          <OverviewInsights kpis={data.kpis} currency={data.currency} />
        </>
      )}
    </div>
  );
}

/** Contextual, at-a-glance insights derived from the current KPIs. */
function OverviewInsights({
  kpis,
  currency,
}: {
  kpis: OverviewKpis;
  currency: string;
}) {
  const decided = kpis.approved.count + kpis.rejected.count;
  const approvalRate =
    decided > 0 ? Math.round((kpis.approved.count / decided) * 100) : null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <InsightChip
        label="Approval rate"
        value={approvalRate === null ? "—" : `${approvalRate}%`}
        hint="of reviewed expenses"
      />
      <InsightChip
        label="Awaiting review"
        value={String(kpis.pending.count)}
        hint={`${formatMoney(kpis.pending.amount, currency)} in the queue`}
      />
      <InsightChip
        label="Submitted total"
        value={String(kpis.total.count)}
        hint={`${formatMoney(kpis.total.amount, currency)} all-time`}
      />
    </div>
  );
}

function InsightChip({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-xs text-muted-foreground/70">{hint}</div>
      </div>
      <div className="shrink-0 text-lg font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
