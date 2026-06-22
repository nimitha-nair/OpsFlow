/**
 * HR Insights Dashboard — the HR-facing counterpart to the Admin Reports
 * workspace. Same shell (section rail + per-section export) but HR-relevant
 * sections: Workforce, Expense Governance, Reimbursement Operations, AI
 * Processing, and Audit & Risk. All metrics are derived from data HR can
 * actually read (overview + expense lifecycle list + user directory; the
 * admin-only AI report is requested best-effort and the section degrades
 * gracefully when it is unavailable).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../layout/PageHeader";
import { SectionCard } from "../common/SectionCard";
import { LoadingState } from "../common/LoadingState";
import { ErrorState } from "../common/ErrorState";
import { BarList } from "./charts";
import { DonutGauge, KpiCard, RankingList } from "./bi";
import { paletteAt } from "../common/accent";
import {
  SectionFrame,
  SectionRail,
  scrollToSection,
  useScrollSpy,
  type SectionDef,
} from "./workspace/shell";
import { formatCompactMoney, formatMoney } from "../../lib/format";
import { downloadCsv, printElement } from "../../lib/export";
import { getReportsOverview, getReportsAiAnalytics } from "../../lib/reports-api";
import { listReviewExpenses } from "../../lib/expenses-api";
import { listUsers } from "../../lib/users-api";
import type { AiAnalyticsReport, OverviewReport } from "../../types/reports";
import type { Expense } from "../../types/expense";
import type { User } from "../../types/user";
import {
  deriveAudit,
  deriveProcessing,
  deriveReimbursements,
} from "./workspace/derive";

const SECTIONS: SectionDef[] = [
  { id: "workforce", label: "Workforce Overview", icon: Users },
  { id: "governance", label: "Expense Governance", icon: ShieldCheck },
  { id: "reimbursement", label: "Reimbursement Ops", icon: Banknote },
  { id: "ai", label: "AI Processing", icon: Sparkles },
  { id: "risk", label: "Audit & Risk", icon: AlertTriangle },
];

const pct = (n: number) => `${Math.round(n)}%`;

function withinDays(iso: string, days: number): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

interface LoadedData {
  overview: OverviewReport;
  records: Expense[];
  users: User[];
  ai: AiAnalyticsReport | null;
}

export function HrInsightsDashboard() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useScrollSpy(SECTIONS.map((s) => s.id));

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    const [overview, records, usersResp, ai] = await Promise.all([
      getReportsOverview(),
      listReviewExpenses("ALL"),
      listUsers({ limit: 1000 }),
      getReportsAiAnalytics(12).catch(() => null),
    ]);
    if (signal?.cancelled) return;
    setData({ overview, records, users: usersResp.data, ai });
    setError(null);
  }, []);

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    load(signal)
      .catch(() => !signal.cancelled && setError("We couldn't load HR insights. Please try again."))
      .finally(() => !signal.cancelled && setLoading(false));
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load()
      .catch(() => setError("We couldn't refresh HR insights. Please try again."))
      .finally(() => setRefreshing(false));
  };

  return (
    <>
      <PageHeader
        title="HR Insights"
        description="Workforce, governance, and compliance intelligence for HR."
        breadcrumbs={[{ label: "HR" }, { label: "Insights" }]}
        actions={
          !loading && !error && data ? (
            <div className="no-print flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => printElement(rootRef.current, "opsflow-hr-report")}>
                <Download className="size-4" />
                Complete HR Report
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState label="Loading HR insights…" />
      ) : error || !data ? (
        <ErrorState
          title="Couldn't load HR insights"
          description={error ?? "No data."}
          onRetry={onRefresh}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
          <SectionRail sections={SECTIONS} active={active} onGo={scrollToSection} />
          <div ref={rootRef} className="flex min-w-0 flex-col gap-12">
            <Workforce data={data} />
            <Governance data={data} />
            <Reimbursement data={data} />
            <AiProcessing data={data} />
            <AuditRisk data={data} />
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Workforce ------------------------------- */

function Workforce({ data }: { data: LoadedData }) {
  const { users } = data;
  const activeCount = users.filter((u) => u.isActive).length;
  const newHires = users.filter((u) => withinDays(u.createdAt, 30)).length;

  const byDept = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      const d = u.department?.trim() || "Unassigned";
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [users]);

  const byRole = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) map.set(u.role, (map.get(u.role) ?? 0) + 1);
    return [...map.entries()].map(([role, count]) => ({ role, count }));
  }, [users]);

  const maxDept = byDept[0]?.count || 1;

  return (
    <SectionFrame
      id="workforce"
      title="Workforce Overview"
      description="Headcount, distribution, and recent joiners."
      onCsv={() =>
        downloadCsv("opsflow-hr-workforce", byDept, [
          { label: "Department", value: (d) => d.name },
          { label: "Headcount", value: (d) => d.count },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} emphasize accent="indigo" icon={Users} label="Total employees" value={users.length} />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Active"
          value={activeCount}
          hint={`${pct((activeCount / Math.max(1, users.length)) * 100)} of workforce`}
        />
        <KpiCard index={2} accent="violet" icon={UserPlus} label="New hires (30d)" value={newHires} />
        <KpiCard index={3} accent="amber" icon={Users} label="Departments" value={byDept.length} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Department distribution" description="Headcount by department">
          <BarList
            items={byDept.slice(0, 8).map((d, i) => ({
              label: d.name,
              valueText: String(d.count),
              ratio: d.count / maxDept,
              tone: paletteAt(i),
            }))}
          />
        </SectionCard>
        <SectionCard title="Role mix" description="Composition by access role">
          <RankingList
            accent="indigo"
            items={byRole.map((r) => ({
              label: r.role,
              valueText: String(r.count),
              ratio: r.count / Math.max(1, ...byRole.map((x) => x.count)),
            }))}
          />
        </SectionCard>
      </div>
    </SectionFrame>
  );
}

/* ----------------------------- Governance ------------------------------ */

function Governance({ data }: { data: LoadedData }) {
  const { overview, records } = data;
  const k = overview.kpis;
  const currency = overview.currency;
  const processing = useMemo(() => deriveProcessing(records), [records]);
  const decided = k.approved.count + k.rejected.count;
  const approvalRate = decided > 0 ? (k.approved.count / decided) * 100 : 0;
  const rejectionRate = decided > 0 ? (k.rejected.count / decided) * 100 : 0;
  const manualReviewed = records.filter(
    (e) => e.creationMethod === "MANUAL" && (e.approvalStatus === "SUBMITTED" || e.approvalStatus === "PENDING_REVIEW"),
  ).length;

  return (
    <SectionFrame
      id="governance"
      title="Expense Governance"
      description="Approval throughput, rejection trends, and review workload."
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="amber"
          icon={Clock}
          label="Pending approvals"
          value={k.pending.count}
          hint={`${formatCompactMoney(k.pending.amount, currency)} in queue`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="sky"
          icon={Timer}
          label="Approval turnaround"
          value={processing.avgDays === null ? "—" : `${processing.avgDays.toFixed(1)}d`}
          hint={processing.reviewedCount > 0 ? `${processing.reviewedCount} reviewed` : undefined}
        />
        <KpiCard
          index={2}
          accent="rose"
          icon={XCircle}
          label="Rejection rate"
          value={pct(rejectionRate)}
          hint={`${k.rejected.count} rejected`}
          invertTrend
        />
        <KpiCard
          index={3}
          accent="violet"
          icon={Receipt}
          label="Manual-entry reviews"
          value={manualReviewed}
          hint="awaiting review, no receipt"
          invertTrend
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <SectionCard title="Approval rate" description="Reviewed expenses approved" className="lg:col-span-1">
          <div className="flex justify-center py-2">
            <DonutGauge
              value={approvalRate}
              accent={approvalRate >= 80 ? "emerald" : approvalRate >= 60 ? "amber" : "rose"}
              centerLabel="approved"
              centerSub={`${decided} reviewed`}
            />
          </div>
        </SectionCard>
        <SectionCard title="Turnaround distribution" description="Time from submission to decision" className="lg:col-span-2">
          {processing.buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviewed expenses yet.</p>
          ) : (
            <BarList
              items={processing.buckets.map((b, i) => ({
                label: b.label,
                valueText: String(b.count),
                ratio: b.count / Math.max(1, ...processing.buckets.map((x) => x.count)),
                tone: paletteAt(i),
              }))}
            />
          )}
        </SectionCard>
      </div>
    </SectionFrame>
  );
}

/* --------------------------- Reimbursement ----------------------------- */

function Reimbursement({ data }: { data: LoadedData }) {
  const { records, users, overview } = data;
  const currency = overview.currency;
  const model = useMemo(() => deriveReimbursements(records, users), [records, users]);

  return (
    <SectionFrame
      id="reimbursement"
      title="Reimbursement Operations"
      description="Outstanding payouts and departmental distribution."
      onCsv={() =>
        downloadCsv("opsflow-hr-reimbursement", model.byDepartment, [
          { label: "Department", value: (d) => d.name },
          { label: "Outstanding", value: (d) => d.outstanding },
          { label: "Paid", value: (d) => d.paid },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          emphasize
          accent="amber"
          icon={Banknote}
          label="Pending reimbursements"
          value={formatCompactMoney(model.pendingAmount, currency)}
          hint={`${model.outstandingCount} unpaid`}
          invertTrend
        />
        <KpiCard
          index={1}
          accent="emerald"
          icon={CheckCircle2}
          label="Paid out"
          value={formatCompactMoney(model.paidAmount, currency)}
          hint={`${model.byStatus.PAID.count} reimbursed`}
        />
        <KpiCard index={2} accent="sky" icon={Clock} label="Processing" value={model.byStatus.PROCESSING.count} />
        <KpiCard index={3} accent="rose" icon={AlertTriangle} label="Pending" value={model.byStatus.PENDING.count} invertTrend />
      </div>

      <SectionCard title="Outstanding by department" description="Where payouts are owed">
        {model.byDepartment.filter((d) => d.outstanding > 0).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
        ) : (
          <RankingList
            accent="amber"
            items={model.byDepartment
              .filter((d) => d.outstanding > 0)
              .slice(0, 8)
              .map((d) => ({
                label: d.name,
                valueText: formatCompactMoney(d.outstanding, currency),
                ratio: d.outstanding / (model.byDepartment[0]?.outstanding || 1),
                sub: `${formatMoney(d.paid, currency)} paid`,
              }))}
          />
        )}
      </SectionCard>
      <p className="text-xs text-muted-foreground">
        Average reimbursement time isn't shown — payouts don't yet carry a
        settlement timestamp. Add one to enable cycle-time tracking.
      </p>
    </SectionFrame>
  );
}

/* ---------------------------- AI Processing ---------------------------- */

function AiProcessing({ data }: { data: LoadedData }) {
  const { ai, records } = data;
  const aiCreated = records.filter((e) => e.creationMethod === "AI").length;
  const manualCreated = records.filter((e) => e.creationMethod === "MANUAL").length;
  const known = aiCreated + manualCreated;
  const aiPct = known > 0 ? (aiCreated / known) * 100 : null;
  const multiDoc = records.filter((e) => (e.documentIds?.length ?? 0) > 1).length;

  return (
    <SectionFrame
      id="ai"
      title="AI Processing"
      description="Extraction adoption, accuracy, and correction workload."
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          accent="violet"
          icon={Sparkles}
          label="AI-created expenses"
          value={aiPct === null ? "—" : pct(aiPct)}
          hint={`${aiCreated} of ${known} with a known method`}
        />
        <KpiCard
          index={1}
          accent="sky"
          icon={CheckCircle2}
          label="Extraction accuracy"
          value={ai?.totals.averageConfidence != null ? pct(ai.totals.averageConfidence) : "—"}
          hint={ai ? "avg confidence" : "needs admin AI analytics"}
        />
        <KpiCard
          index={2}
          accent="amber"
          icon={Receipt}
          label="Manual correction rate"
          value={ai?.totals.manualCorrectionRate != null ? pct(ai.totals.manualCorrectionRate) : "—"}
          hint={ai ? `${ai.totals.corrected} corrected` : "needs admin AI analytics"}
          invertTrend
        />
        <KpiCard index={3} accent="indigo" icon={Sparkles} label="Multi-document" value={multiDoc} hint="expenses with 2+ files" />
      </div>

      {ai ? (
        <SectionCard title="Confidence distribution" description="Extraction confidence buckets">
          <BarList
            items={ai.confidenceDistribution.map((b, i) => ({
              label: b.label,
              valueText: String(b.count),
              ratio: b.count / Math.max(1, ...ai.confidenceDistribution.map((x) => x.count)),
              tone: paletteAt(i),
            }))}
          />
        </SectionCard>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Detailed extraction-accuracy analytics (confidence trends, provider
          performance) are sourced from the admin AI report and aren't available
          to the HR role. Adoption metrics above are derived from expense records.
        </div>
      )}
    </SectionFrame>
  );
}

/* ----------------------------- Audit & Risk ---------------------------- */

function AuditRisk({ data }: { data: LoadedData }) {
  const { records, users, overview } = data;
  const currency = overview.currency;
  const audit = useMemo(() => deriveAudit(records, users), [records, users]);

  return (
    <SectionFrame
      id="risk"
      title="Audit & Risk"
      description="Manual entries, missing documents, and policy flags."
      onCsv={() =>
        downloadCsv("opsflow-hr-audit", audit.flags, [
          { label: "Employee", value: (f) => f.employee },
          { label: "Department", value: (f) => f.department },
          { label: "Reason", value: (f) => f.reason },
          { label: "Severity", value: (f) => f.severity },
          { label: "Amount", value: (f) => f.amount },
          { label: "Date", value: (f) => f.date },
        ])
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          accent="amber"
          icon={Receipt}
          label="Manual-entry volume"
          value={audit.manualCount}
          hint={audit.manualPct === null ? undefined : `${pct(audit.manualPct)} of submissions`}
          invertTrend
        />
        <KpiCard index={1} accent="rose" icon={AlertTriangle} label="Missing documentation" value={audit.missingDocCount} invertTrend />
        <KpiCard index={2} accent="violet" icon={ShieldCheck} label="Suspicious submissions" value={audit.flags.length} invertTrend />
        <KpiCard index={3} accent="slate" icon={XCircle} label="Rejected" value={audit.rejectedCount} invertTrend />
      </div>

      <SectionCard title="Flagged submissions" description="Prioritized compliance review">
        {audit.flags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy flags. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Severity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.flags.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.employee}</TableCell>
                    <TableCell className="text-muted-foreground">{f.department}</TableCell>
                    <TableCell>{f.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(f.amount, currency)}</TableCell>
                    <TableCell>
                      <Badge variant={f.severity === "high" ? "destructive" : "secondary"}>
                        {f.severity === "high" ? "High" : "Medium"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </SectionFrame>
  );
}
