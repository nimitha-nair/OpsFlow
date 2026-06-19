import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  RefreshCw,
  Receipt,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "../components/layout/PageHeader";
import { StatCard } from "../components/dashboard/StatCard";
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

const KPI_DEFS: {
  key: keyof OverviewKpis;
  label: string;
  icon: LucideIcon;
}[] = [
  { key: "total", label: "Total Expenses", icon: Receipt },
  { key: "approved", label: "Approved Expenses", icon: CheckCircle2 },
  { key: "pending", label: "Pending Expenses", icon: Clock },
  { key: "rejected", label: "Rejected Expenses", icon: XCircle },
];

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            data={data}
            loading={loading}
            refreshing={refreshing}
            error={error}
            onRefresh={onRefresh}
            onRetry={onRetry}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpensesTab />
        </TabsContent>

        {tabs.some((t) => t.value === "projects") && (
          <TabsContent value="projects" className="mt-4">
            <ProjectsTab />
          </TabsContent>
        )}

        {tabs.some((t) => t.value === "ai") && (
          <TabsContent value="ai" className="mt-4">
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
    <div className="flex flex-col gap-4">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPI_DEFS.map(({ key, label, icon }) => {
            const k = data.kpis[key];
            return (
              <StatCard
                key={key}
                label={label}
                value={k.count}
                icon={icon}
                hint={formatMoney(k.amount, data.currency)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
