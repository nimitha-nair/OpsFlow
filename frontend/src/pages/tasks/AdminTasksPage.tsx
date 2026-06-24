/**
 * AdminTasksPage — first-class Admin Tasks module.
 *
 * Tabs: Dashboard | List | Analytics
 * Create Task is a primary PageHeader action (not a tab).
 * The List tab is fully functional; Dashboard + Analytics are date-scoped.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Layers,
  PauseCircle,
  Plus,
  Search,
  Timer,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { MetricCard } from "../../components/common/MetricCard";
import { SectionCard } from "../../components/common/SectionCard";
import { BarList } from "../../components/reports/charts";
import { PageHeader } from "../../components/layout/PageHeader";
import { DueDate } from "../../components/tasks/DueDate";
import { TaskPriorityBadge, TaskStatusBadge } from "../../components/tasks/TaskBadges";
import { QuickCreateTaskDialog } from "../../components/tasks/QuickCreateTaskDialog";
import { makeRange, rangeSlug, rangeToParams, type DateRange } from "../../lib/date-range";
import { listProjects } from "../../lib/projects-api";
import { apiErrorMessage, listTasks } from "../../lib/tasks-api";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../types/task";

type AdminTab = "dashboard" | "list" | "analytics";

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export function AdminTasksPage() {
  const [tab, setTab] = useState<AdminTab>("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Create and track tasks across all projects."
        breadcrumbs={[{ label: "Tasks" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New Task
            </Button>
          </div>
        }
      />

      <div className="flex min-w-0 flex-col gap-6">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as AdminTab)}
        >
          <TabsList variant="line" className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === "dashboard" && (
          <DashboardTab
            onNewTask={() => setCreateOpen(true)}
          />
        )}
        {tab === "list" && (
          <ListTab reloadKey={reloadKey} onCreated={() => setReloadKey((k) => k + 1)} />
        )}
        {tab === "analytics" && <AnalyticsTab />}
      </div>

      <QuickCreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setReloadKey((k) => k + 1);
          // Switch to List tab so the user sees the new task
          setTab("list");
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard tab                                                       */
/* ------------------------------------------------------------------ */

interface DashboardTabProps {
  onNewTask: () => void;
}

function DashboardTab({ onNewTask }: DashboardTabProps) {
  const [range, setRange] = useState<DateRange>(() => makeRange("30d"));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const fetched = await listTasks({ limit: 500, ...rangeToParams(range) });
      if (!signal.cancelled) setTasks(fetched);
    } catch (err) {
      if (!signal.cancelled) setError(apiErrorMessage(err, "Failed to load tasks."));
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  const now = Date.now();
  const in7Days = now + 7 * 24 * 60 * 60 * 1000;

  const kpis = useMemo(() => {
    const total = tasks.length;
    const byStatus = Object.fromEntries(
      TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]),
    ) as Record<TaskStatus, number>;
    const overdue = tasks.filter((t) => {
      if (t.status === "DONE") return false;
      const due = Date.parse(t.dueDate);
      return !Number.isNaN(due) && due < now;
    }).length;
    const dueSoon = tasks.filter((t) => {
      if (t.status === "DONE") return false;
      const due = Date.parse(t.dueDate);
      return !Number.isNaN(due) && due >= now && due <= in7Days;
    }).length;
    return { total, byStatus, overdue, dueSoon };
  }, [tasks, now, in7Days]);

  // Most recent 7 by dueDate descending (then createdAt desc)
  const recent = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => {
          const da = Date.parse(a.dueDate ?? "");
          const db = Date.parse(b.dueDate ?? "");
          if (!Number.isNaN(da) && !Number.isNaN(db)) return db - da;
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
        })
        .slice(0, 7),
    [tasks],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Date filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangeFilter value={range} onChange={setRange} />
        <ActiveRangeBadge range={range} />
      </div>

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : error ? (
        <ErrorState title="Couldn't load tasks" description={error} />
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard index={0} accent="indigo" label="Total tasks" value={kpis.total} icon={ClipboardList} />
            <MetricCard index={1} accent="sky" label="To Do" value={kpis.byStatus.TODO} icon={Layers} />
            <MetricCard index={2} accent="amber" label="In Progress" value={kpis.byStatus.IN_PROGRESS} icon={Timer} />
            <MetricCard index={3} accent="emerald" label="Done" value={kpis.byStatus.DONE} icon={CheckCircle2} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <MetricCard index={4} accent="violet" label="On Hold" value={kpis.byStatus.ON_HOLD} icon={PauseCircle} />
            <MetricCard index={5} accent="sky" label="In Review" value={kpis.byStatus.REVIEW} icon={BarChart3} />
            <MetricCard index={6} accent="rose" label="Overdue" value={kpis.overdue} icon={AlertTriangle} hint="Past due, not done" />
            <MetricCard index={7} accent="amber" label="Due soon" value={kpis.dueSoon} icon={Clock} hint="Next 7 days, not done" />
          </div>

          {/* Quick action + Recent tasks */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* New Task quick action */}
            <Card
              role="button"
              tabIndex={0}
              onClick={onNewTask}
              onKeyDown={(e) => e.key === "Enter" && onNewTask()}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-8 text-center transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Zap className="size-6" />
              </span>
              <div>
                <p className="font-semibold text-foreground">New Task</p>
                <p className="text-xs text-muted-foreground">Quick-create a task</p>
              </div>
            </Card>

            {/* Recent tasks */}
            <SectionCard
              title="Recent tasks"
              description="Latest by due date"
              className="lg:col-span-2"
            >
              {recent.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No tasks in range"
                  description="Try expanding the date range."
                />
              ) : (
                <ul className="flex flex-col divide-y">
                  {recent.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        {task.code && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {task.code}{" "}
                          </span>
                        )}
                        <span className="truncate text-sm font-medium text-foreground">
                          {task.title}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <TaskStatusBadge status={task.status} />
                        <DueDate dueDate={task.dueDate} status={task.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Analytics tab                                                       */
/* ------------------------------------------------------------------ */

function AnalyticsTab() {
  const [range, setRange] = useState<DateRange>(() => makeRange("30d"));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const [fetched, projectsResp] = await Promise.all([
        listTasks({ limit: 500, ...rangeToParams(range) }),
        listProjects({ limit: 200 }),
      ]);
      if (!signal.cancelled) {
        setTasks(fetched);
        setProjectNames(new Map(projectsResp.data.map((p) => [p.id, p.name])));
      }
    } catch (err) {
      if (!signal.cancelled) setError(apiErrorMessage(err, "Failed to load tasks."));
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  const { statusItems, priorityItems, projectItems } = useMemo(() => {
    const total = tasks.length || 1;

    const statusItems = TASK_STATUSES.map((s) => {
      const count = tasks.filter((t) => t.status === s).length;
      return { label: TASK_STATUS_LABELS[s], valueText: String(count), ratio: count / total };
    }).filter((it) => it.ratio > 0);

    const priorityItems = TASK_PRIORITIES.map((p) => {
      const count = tasks.filter((t) => t.priority === p).length;
      return { label: TASK_PRIORITY_LABELS[p], valueText: String(count), ratio: count / total };
    }).filter((it) => it.ratio > 0);

    // Per-project breakdown (top 8)
    const projectCounts = new Map<string, number>();
    for (const t of tasks) {
      projectCounts.set(t.projectId, (projectCounts.get(t.projectId) ?? 0) + 1);
    }
    const projectItems = [...projectCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, count]) => ({
        label: projectNames.get(id) ?? id,
        valueText: String(count),
        ratio: count / total,
      }));

    return { statusItems, priorityItems, projectItems };
  }, [tasks, projectNames]);

  const onExport = () => {
    const header = ["Code", "Title", "Status", "Priority", "Due Date", "Project"].join(",");
    const rows = tasks.map((t) =>
      [
        t.code ?? "",
        `"${t.title.replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        t.dueDate,
        `"${(projectNames.get(t.projectId) ?? "").replace(/"/g, '""')}"`,
      ].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${rangeSlug(range)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Date filter row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <ActiveRangeBadge range={range} />
        </div>
        {!loading && !error && tasks.length > 0 && (
          <Button variant="outline" size="sm" onClick={onExport}>
            Export CSV
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState label="Loading analytics…" />
      ) : error ? (
        <ErrorState title="Couldn't load tasks" description={error} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No tasks in range"
          description="Try expanding the date range to see analytics."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SectionCard
            title="Status distribution"
            description={`${tasks.length} task${tasks.length === 1 ? "" : "s"} in range`}
          >
            <BarList items={statusItems} />
          </SectionCard>

          <SectionCard
            title="Priority distribution"
            description="Breakdown by priority level"
          >
            <BarList items={priorityItems} />
          </SectionCard>

          {projectItems.length > 0 && (
            <SectionCard
              title="Tasks per project"
              description="Top 8 projects by task count"
              className="lg:col-span-2"
            >
              <BarList items={projectItems} />
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List tab                                                            */
/* ------------------------------------------------------------------ */

interface ListTabProps {
  reloadKey: number;
  onCreated: () => void;
}

function ListTab({ reloadKey }: ListTabProps) {
  // --- server-side filter state (trigger refetch on change) ---
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [version, setVersion] = useState("all");

  // --- client-side search ---
  const [search, setSearch] = useState("");

  // --- data ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const dateParams = rangeToParams(range);
        const params = {
          limit: 500,
          ...dateParams,
          ...(status !== "all" ? { status } : {}),
          ...(priority !== "all" ? { priority } : {}),
          ...(version !== "all" ? { version } : {}),
        };
        const [fetched, projectsResp] = await Promise.all([
          listTasks(params),
          listProjects({ limit: 200 }),
        ]);
        if (signal?.cancelled) return;
        setTasks(fetched);
        setProjectNames(new Map(projectsResp.data.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!signal?.cancelled) setError(apiErrorMessage(err, "Failed to load tasks."));
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range, status, priority, version, reloadKey],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  // Distinct version values from the loaded set
  const versions = useMemo(
    () =>
      [...new Set(tasks.map((t) => t.version).filter((v): v is string => Boolean(v)))].sort(),
    [tasks],
  );

  // Client-side search filter (title or code)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.code ?? "").toLowerCase().includes(q),
    );
  }, [tasks, search]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Client-side search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="h-8 pl-8"
          />
        </div>

        {/* Status */}
        <Select
          value={status}
          onValueChange={(v) => setStatus((v ?? "all") as TaskStatus | "all")}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority */}
        <Select
          value={priority}
          onValueChange={(v) => setPriority((v ?? "all") as TaskPriority | "all")}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {TASK_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Version (only when there are versions in the loaded set) */}
        {versions.length > 0 && (
          <Select value={version} onValueChange={(v) => setVersion(v ?? "all")}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All versions</SelectItem>
              {versions.map((ver) => (
                <SelectItem key={ver} value={ver}>
                  v{ver}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DateRangeFilter value={range} onChange={setRange} />
        <ActiveRangeBadge range={range} />
      </div>

      {/* Content */}
      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingState label="Loading tasks…" />
        ) : error ? (
          <div className="p-6">
            <ErrorState title="Couldn't load tasks" description={error} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ClipboardList}
              title={tasks.length === 0 ? "No tasks yet" : "No tasks match"}
              description={
                tasks.length === 0
                  ? "Create a task using the New Task button above."
                  : "Try adjusting your filters or date range."
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Version</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {task.code ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="font-medium text-foreground">{task.title}</div>
                        {task.description && (
                          <div className="truncate text-xs text-muted-foreground">
                            {task.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {projectNames.get(task.projectId) ?? "—"}
                      </TableCell>
                      <TableCell>
                        <TaskPriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell>
                        <TaskStatusBadge status={task.status} />
                      </TableCell>
                      <TableCell>
                        <DueDate dueDate={task.dueDate} status={task.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {task.version ? `v${task.version}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="flex flex-col divide-y md:hidden">
              {filtered.map((task) => (
                <li key={task.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {task.code && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {task.code}
                        </p>
                      )}
                      <p className="font-medium text-foreground">{task.title}</p>
                      {task.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <TaskPriorityBadge priority={task.priority} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{projectNames.get(task.projectId) ?? "—"}</span>
                    <DueDate dueDate={task.dueDate} status={task.status} />
                    {task.version && <span>v{task.version}</span>}
                  </div>
                  <div>
                    <TaskStatusBadge status={task.status} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
