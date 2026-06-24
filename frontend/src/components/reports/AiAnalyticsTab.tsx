import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Gauge,
  PencilLine,
  RefreshCw,
  TriangleAlert,
  XCircle,
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
import { SectionCard } from "../common/SectionCard";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { BarList, ColumnChart } from "./charts";
import { monthsToParams } from "../../lib/date-range";
import { getReportsAiAnalytics } from "../../lib/reports-api";
import type { AiAnalyticsReport } from "../../types/reports";

const MONTH_OPTIONS = [3, 6, 12, 24];
const ERROR_MSG = "We couldn't load the AI analytics. Please try again.";

const pctText = (n: number | null) => (n === null ? "—" : `${n}%`);

function formatMs(ms: number | null): string {
  if (ms === null) return "Not tracked yet";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms} ms`;
}

function providerLabel(p: string): string {
  if (p === "kimi") return "Kimi";
  if (p === "mock") return "Mock";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
}

export function AiAnalyticsTab() {
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<AiAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAi = useCallback(async (m: number) => {
    try {
      setData(await getReportsAiAnalytics(monthsToParams(m)));
      setError(null);
    } catch {
      setError(ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      try {
        const r = await getReportsAiAnalytics(monthsToParams(12));
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
    void fetchAi(m).finally(() => setRefreshing(false));
  };
  const onRefresh = () => {
    setRefreshing(true);
    void fetchAi(months).finally(() => setRefreshing(false));
  };
  const onRetry = () => {
    setLoading(true);
    void fetchAi(months).finally(() => setLoading(false));
  };

  if (loading) return <LoadingState label="Loading AI analytics…" />;
  if (error)
    return (
      <ErrorState title="Couldn't load analytics" description={error} onRetry={onRetry} />
    );
  if (!data) return null;

  const t = data.totals;

  if (t.total === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No AI analyses yet"
        description="Metrics will appear once receipts are analyzed."
      />
    );
  }

  const sb = data.statusBreakdown;
  const statusItems = [
    { label: "Completed", count: sb.completed, tone: "from-emerald-500 to-teal-500" },
    { label: "Low confidence", count: sb.lowConfidence, tone: "from-amber-500 to-orange-500" },
    { label: "Failed", count: sb.failed, tone: "from-rose-500 to-red-500" },
    { label: "Processing", count: sb.processing, tone: "from-sky-500 to-blue-500" },
    { label: "Pending", count: sb.pending, tone: "from-slate-400 to-slate-500" },
  ].map((s) => ({
    label: s.label,
    valueText: String(s.count),
    ratio: t.total > 0 ? s.count / t.total : 0,
    tone: s.tone,
  }));

  const maxBucket = Math.max(1, ...data.confidenceDistribution.map((b) => b.count));
  const confItems = data.confidenceDistribution.map((b) => ({
    label: b.label,
    valueText: String(b.count),
    ratio: b.count / maxBucket,
  }));

  const providerItems = data.providerDistribution.map((p) => ({
    label: providerLabel(p.provider),
    valueText: String(p.count),
    ratio: t.total > 0 ? p.count / t.total : 0,
  }));

  const conf = data.corrections;
  const correctionItems = [
    {
      label: "Unchanged (AI accepted)",
      valueText: String(conf.unchanged),
      ratio: conf.confirmed > 0 ? conf.unchanged / conf.confirmed : 0,
      tone: "from-emerald-500 to-teal-500",
    },
    {
      label: "Corrected by employee",
      valueText: String(conf.corrected),
      ratio: conf.confirmed > 0 ? conf.corrected / conf.confirmed : 0,
      tone: "from-amber-500 to-orange-500",
    },
  ];

  const maxTrend = Math.max(1, ...data.lowConfidenceTrend.map((p) => p.total));
  const trendItems = data.lowConfidenceTrend.map((p) => ({
    key: p.month,
    label: monthLabel(p.month),
    ratio: p.lowConfidence / maxTrend,
    title: `${monthLabel(p.month)} · ${p.lowConfidence} low-confidence of ${p.total}`,
    tone: "from-amber-500 to-orange-400",
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t.total} analyses · {t.confirmed} confirmed
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(months)}
            onValueChange={(v) => v && changeMonths(Number(v))}
            disabled={refreshing}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="Trend range">
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
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
        <KpiCard index={0} accent="indigo" label="Total analyses" value={t.total} icon={Bot} />
        <KpiCard index={1} accent="sky" label="Avg confidence" value={pctText(t.averageConfidence)} icon={Gauge} />
        <KpiCard index={2} accent="emerald" label="Success rate" value={pctText(t.successRate)} icon={CheckCircle2} />
        <KpiCard index={3} accent="amber" label="Low confidence" value={pctText(t.lowConfidencePct)} icon={TriangleAlert} />
        <KpiCard index={4} accent="rose" label="Failed" value={t.failed} icon={XCircle} />
        <KpiCard
          index={5}
          accent="violet"
          label="Manual corrections"
          value={pctText(t.manualCorrectionRate)}
          icon={PencilLine}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Analysis status breakdown" description="All-time">
          <BarList items={statusItems} />
        </SectionCard>

        <SectionCard
          title="Confidence distribution"
          description="Across scored analyses"
        >
          <BarList items={confItems} />
        </SectionCard>

        <SectionCard
          title="AI vs employee corrections"
          description={`Of ${conf.confirmed} confirmed analyses`}
        >
          {conf.confirmed === 0 ? (
            <p className="text-sm text-muted-foreground">
              No confirmed analyses yet.
            </p>
          ) : (
            <BarList items={correctionItems} />
          )}
        </SectionCard>

        <SectionCard title="Provider distribution" description="By extractor">
          <BarList items={providerItems} />
        </SectionCard>

        <SectionCard
          title="Performance & usage"
          description="Processing time and Kimi token usage"
        >
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Avg processing time" value={formatMs(t.averageProcessingMs)} />
            <Metric
              label="Kimi tokens"
              value={
                data.kimiUsage
                  ? `${data.kimiUsage.totalTokens.toLocaleString()} total`
                  : "Not tracked yet"
              }
              hint={
                data.kimiUsage
                  ? `${data.kimiUsage.averageTokens.toLocaleString()}/analysis · ${data.kimiUsage.analysesWithTokens} runs`
                  : undefined
              }
            />
          </dl>
        </SectionCard>

        {data.adoption && (
          <SectionCard
            title="AI adoption"
            description="How employees are using the AI-first flow"
          >
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Metric
                label="AI-created expenses"
                value={pctText(data.adoption.aiCreatedPct)}
                hint={`${data.adoption.aiCreated} AI · ${data.adoption.manualCreated} manual${
                  data.adoption.unknownCreated > 0
                    ? ` · ${data.adoption.unknownCreated} older`
                    : ""
                }`}
              />
              <Metric
                label="Multi-document analyses"
                value={pctText(data.adoption.multiDocPct)}
                hint={`${data.adoption.multiDocExpenses} used more than one document`}
              />
            </dl>
          </SectionCard>
        )}

        <SectionCard
          title={`Low-confidence trend · last ${months} months`}
          description="Low-confidence analyses per month"
          className="lg:col-span-2"
        >
          <ColumnChart items={trendItems} />
        </SectionCard>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/20 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight text-foreground">
        {value}
      </dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
