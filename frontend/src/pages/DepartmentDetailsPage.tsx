import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  HeartPulse,
  ListChecks,
  Timer,
  Users,
  Wallet,
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
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { KpiCard, AreaTrend, DonutGauge, RankingList } from "../components/reports/bi";
import { BarList } from "../components/reports/charts";
import { TaskStatusSummary } from "../components/dashboard/TaskStatusSummary";
import {
  deriveDepartmentDetail,
  type DepartmentDetail,
} from "../components/reports/workspace/derive";
import { apiErrorMessage, listUsers } from "../lib/users-api";
import { listReviewExpenses } from "../lib/expenses-api";
import { listTasks } from "../lib/tasks-api";
import { getReportsProjects } from "../lib/reports-api";
import { downloadCsv, printElement } from "../lib/export";
import { formatCompactMoney, formatMoney } from "../lib/format";
import { CATEGORY_LABELS, type ExpenseCategory } from "../types/expense";
import type { Expense } from "../types/expense";
import type { Task } from "../types/task";
import type { User } from "../types/user";

export function DepartmentDetailsPage() {
  const { name: rawName } = useParams<{ name: string }>();
  const name = rawName ? decodeURIComponent(rawName) : "";

  const [users, setUsers] = useState<User[]>([]);
  const [records, setRecords] = useState<Expense[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [usersResp, recs, projects, taskList] = await Promise.all([
          listUsers({ limit: 1000 }),
          listReviewExpenses("ALL"),
          getReportsProjects().catch(() => null),
          listTasks({ limit: 1000 }).catch(() => []),
        ]);
        if (cancelled) return;
        setUsers(usersResp.data);
        setRecords(recs);
        setTasks(taskList);
        setProjectNames(
          new Map((projects?.projects ?? []).map((p) => [p.projectId, p.projectName])),
        );
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load data."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const detail = useMemo(
    () => deriveDepartmentDetail(name, records, users, projectNames),
    [name, records, users, projectNames],
  );

  // Task load = tasks assigned to this department's members.
  const deptTasks = useMemo(() => {
    const memberIds = new Set(
      users
        .filter((u) => (u.department?.trim() || "Unassigned") === name)
        .map((u) => u.id),
    );
    return tasks.filter(
      (t) =>
        t.assignment.userIds.some((id) => memberIds.has(id)) ||
        t.assignment.department === name,
    );
  }, [tasks, users, name]);

  const taskStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const open = deptTasks.filter((t) => t.status !== "DONE");
    return {
      total: deptTasks.length,
      open: open.length,
      done: deptTasks.filter((t) => t.status === "DONE").length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      activeProjects: new Set(open.map((t) => t.projectId)).size,
    };
  }, [deptTasks]);

  return (
    <>
      <PageHeader
        title={name}
        description="Department health, spend, and operational breakdown."
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Departments", to: "/admin/departments" },
          { label: name },
        ]}
        actions={
          !loading && !error ? (
            <div className="no-print flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCsv(detail)}>
                <FileSpreadsheet className="size-4" />
                CSV
              </Button>
              <Button
                size="sm"
                onClick={() => printElement(rootRef.current, `opsflow-department-${name}`)}
              >
                <FileText className="size-4" />
                Export PDF
              </Button>
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState label="Loading department…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load department"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div ref={rootRef} className="flex flex-col gap-6">
          <HealthHeader detail={detail} />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              index={0}
              emphasize
              accent="indigo"
              icon={Wallet}
              label="Approved spend"
              value={formatCompactMoney(detail.totalSpend)}
              hint={`${detail.headcount} people`}
            />
            <KpiCard
              index={1}
              accent="emerald"
              icon={CheckCircle2}
              label="Approval rate"
              value={detail.approvalRate === null ? "—" : `${Math.round(detail.approvalRate)}%`}
              hint={detail.documentationRate === null ? undefined : `${Math.round(detail.documentationRate)}% documented`}
            />
            <KpiCard
              index={2}
              accent="amber"
              icon={Timer}
              label="Avg turnaround"
              value={detail.avgProcessingDays === null ? "—" : `${detail.avgProcessingDays.toFixed(1)}d`}
            />
            <KpiCard
              index={3}
              accent="sky"
              icon={FolderKanban}
              label="Projects engaged"
              value={detail.projectsEngaged}
            />
          </div>

          {/* Operations — task load across the department's members. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              index={0}
              accent="indigo"
              icon={ListChecks}
              label="Open tasks"
              value={taskStats.open}
              hint={`${taskStats.total} total · ${taskStats.done} done`}
            />
            <KpiCard
              index={1}
              accent="rose"
              icon={AlertTriangle}
              label="Overdue tasks"
              value={taskStats.overdue}
              invertTrend
            />
            <KpiCard
              index={2}
              accent="violet"
              icon={FolderKanban}
              label="Active projects"
              value={taskStats.activeProjects}
              hint="with open work"
            />
            <KpiCard
              index={3}
              accent="emerald"
              icon={ClipboardList}
              label="Completed"
              value={taskStats.done}
            />
          </div>

          <SectionCard title="Task load" description="Open and completed work by status">
            <TaskStatusSummary tasks={deptTasks} />
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <SectionCard
              title="Spend trend"
              description="Approved spend over the last 12 months"
              className="lg:col-span-2"
            >
              <AreaTrend
                data={detail.monthly}
                accent="indigo"
                format={(v) => formatMoney(v)}
              />
            </SectionCard>
            <SectionCard title="Reimbursement performance" description="Approved payouts">
              <div className="flex flex-col gap-4 py-1">
                <BarList
                  items={[
                    {
                      label: "Outstanding",
                      valueText: formatCompactMoney(detail.reimbursementOutstanding),
                      ratio: ratio(detail.reimbursementOutstanding, detail),
                      tone: "from-amber-500 to-orange-500",
                    },
                    {
                      label: "Paid",
                      valueText: formatCompactMoney(detail.reimbursementPaid),
                      ratio: ratio(detail.reimbursementPaid, detail),
                      tone: "from-emerald-500 to-teal-500",
                    },
                  ]}
                />
                <BudgetNotice />
              </div>
            </SectionCard>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Expense categories" description="Where the money goes">
              {detail.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved spend yet.</p>
              ) : (
                <BarList
                  items={detail.categories.slice(0, 8).map((c) => ({
                    label: CATEGORY_LABELS[c.category as ExpenseCategory] ?? c.category,
                    valueText: formatCompactMoney(c.amount),
                    ratio: c.amount / (detail.categories[0]?.amount || 1),
                  }))}
                />
              )}
            </SectionCard>
            <SectionCard title="Project allocations" description="Spend booked to projects">
              {detail.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No project-scoped spend.</p>
              ) : (
                <RankingList
                  accent="violet"
                  items={detail.projects.slice(0, 6).map((p) => ({
                    label: p.name,
                    valueText: formatCompactMoney(p.amount),
                    ratio: p.amount / (detail.projects[0]?.amount || 1),
                  }))}
                />
              )}
            </SectionCard>
          </div>

          <SectionCard title="Employee breakdown" description="Submissions by team member">
            {detail.employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No submissions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Approved spend</TableHead>
                      <TableHead className="text-right">Submitted</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.employees.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="text-muted-foreground">{e.role}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(e.totalSpend)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{e.submittedCount}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.approvedCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </>
  );
}

function HealthHeader({ detail }: { detail: DepartmentDetail }) {
  const score = detail.healthScore;
  const accent = score === null ? "slate" : score >= 75 ? "emerald" : score >= 50 ? "amber" : "rose";
  return (
    <div className="flex flex-col items-center gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:flex-row sm:items-center">
      <DonutGauge
        value={score ?? 0}
        accent={accent}
        size={148}
        centerValue={score === null ? "—" : String(score)}
        centerLabel="health score"
      />
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <HeartPulse className="size-4" /> Department health
        </div>
        <p className="text-sm text-muted-foreground">
          A composite of approval rate, documentation coverage, and review
          turnaround. Higher is healthier.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniSignal icon={Users} label="Head count" value={`${detail.activeHeadcount}/${detail.headcount}`} />
          <MiniSignal
            icon={CheckCircle2}
            label="Approval"
            value={detail.approvalRate === null ? "—" : `${Math.round(detail.approvalRate)}%`}
          />
          <MiniSignal
            icon={FileText}
            label="Documented"
            value={detail.documentationRate === null ? "—" : `${Math.round(detail.documentationRate)}%`}
          />
          <MiniSignal
            icon={Banknote}
            label="Reimb. due"
            value={formatCompactMoney(detail.reimbursementOutstanding)}
          />
        </div>
      </div>
    </div>
  );
}

function MiniSignal({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

/** Budget utilization has no data source yet (no per-department budgets). */
function BudgetNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Budget utilization</span> —
      not configured. Set per-department budgets to unlock utilization tracking.
    </div>
  );
}

function ratio(amount: number, detail: DepartmentDetail): number {
  const max = Math.max(detail.reimbursementOutstanding, detail.reimbursementPaid, 1);
  return amount / max;
}

function exportCsv(detail: DepartmentDetail) {
  downloadCsv(`opsflow-department-${detail.name}-employees`, detail.employees, [
    { label: "Employee", value: (e) => e.name },
    { label: "Role", value: (e) => e.role },
    { label: "Approved spend", value: (e) => e.totalSpend },
    { label: "Submitted", value: (e) => e.submittedCount },
    { label: "Approved", value: (e) => e.approvedCount },
  ]);
}
