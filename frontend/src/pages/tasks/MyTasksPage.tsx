import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelectFilter } from "../../components/common/MultiSelectFilter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { DueDate } from "../../components/tasks/DueDate";
import { TaskDetailsDialog } from "../../components/kanban/TaskDetailsDialog";
import {
  makeRange,
  rangeToParams,
  TASK_DUE_PRESETS,
  type DateRange,
} from "../../lib/date-range";
import { TaskPriorityBadge } from "../../components/tasks/TaskBadges";
import { TaskStatusControl } from "../../components/tasks/TaskStatusControl";
import { useAuth } from "../../context/auth-context";
import { roleBasePath, roleWorkspaceLabel } from "../../lib/navigation";
import { listMyProjects } from "../../lib/projects-api";
import {
  apiErrorMessage,
  listMyTasks,
  updateTaskStatus,
} from "../../lib/tasks-api";
import {
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "../../types/task";

/** A filterable view: a status, or a due-date lens (overdue / due soon). */
type View = "all" | TaskStatus | "overdue" | "soon";

const todayIso = () => new Date().toISOString().slice(0, 10);
const inNDaysIso = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A task is overdue when its due date has passed and it isn't done. */
function isOverdue(t: Task): boolean {
  return t.status !== "DONE" && t.dueDate < todayIso();
}
/** Due within the next 7 days (and not yet done/overdue). */
function isDueSoon(t: Task): boolean {
  return t.status !== "DONE" && t.dueDate >= todayIso() && t.dueDate <= inNDaysIso(7);
}

export function MyTasksPage() {
  const { user } = useAuth();
  const workspaceBase = user ? roleBasePath[user.role] : "/employee";
  const workspaceLabel = user ? roleWorkspaceLabel[user.role] : "Employee";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  // Multi-select: empty = all; several = OR within field.
  const [versionFilter, setVersionFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"due" | "version" | "priority">("due");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [myTasks, myProjects] = await Promise.all([
          listMyTasks(rangeToParams(range)),
          listMyProjects(),
        ]);
        if (cancelled) return;
        setTasks(myTasks);
        setProjectNames(new Map(myProjects.map((p) => [p.id, p.name])));
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load tasks."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range]);

  async function handleStatusChange(
    taskId: string,
    status: TaskStatus,
    reason?: string,
  ) {
    setUpdatingId(taskId);
    try {
      const updated = await updateTaskStatus(taskId, status, reason);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      setSelectedTask((prev) => (prev?.id === taskId ? updated : prev));
      toast.success("Task status updated.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update status."));
    } finally {
      setUpdatingId(null);
    }
  }

  // Employees progress their own work but cannot complete or reopen tasks;
  // putting a task on hold requires a reason.
  const EMPLOYEE_ALLOWED: TaskStatus[] = ["IN_PROGRESS", "REVIEW", "ON_HOLD"];

  // Employees can't list the user directory; resolve their own name, and label
  // teammates generically (department assignments render the department itself).
  const getAssigneeName = (id: string) =>
    id === user?.id ? (user?.name ?? "You") : "Teammate";

  const projectLabel = (t: Task) =>
    t.projectId ? (projectNames.get(t.projectId) ?? "—") : "General";

  const versions = useMemo(
    () =>
      [...new Set(tasks.map((t) => t.version).filter((v): v is string => Boolean(v)))].sort(),
    [tasks],
  );

  // At-a-glance counts (across all loaded tasks, before the view/search filter).
  const counts = useMemo(() => {
    const c = {
      all: tasks.length,
      TODO: 0,
      IN_PROGRESS: 0,
      REVIEW: 0,
      ON_HOLD: 0,
      DONE: 0,
      overdue: 0,
      soon: 0,
    } as Record<View, number>;
    for (const t of tasks) {
      c[t.status] = (c[t.status] ?? 0) + 1;
      if (isOverdue(t)) c.overdue += 1;
      else if (isDueSoon(t)) c.soon += 1;
    }
    return c;
  }, [tasks]);

  const sorted = useMemo(() => {
    let list = [...tasks];
    if (view === "overdue") list = list.filter(isOverdue);
    else if (view === "soon") list = list.filter(isDueSoon);
    else if (view !== "all") list = list.filter((t) => t.status === view);
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.code?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q),
      );
    if (versionFilter.length) list = list.filter((t) => versionFilter.includes(t.version ?? ""));
    const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    list.sort((a, b) => {
      if (sortBy === "version")
        return (a.version ?? "").localeCompare(b.version ?? "", undefined, { numeric: true });
      if (sortBy === "priority")
        return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      return a.dueDate.localeCompare(b.dueDate);
    });
    return list;
  }, [tasks, view, search, versionFilter, sortBy]);

  const SUMMARY: { key: View; label: string; accent: string }[] = [
    { key: "all", label: "All", accent: "text-foreground" },
    { key: "TODO", label: TASK_STATUS_LABELS.TODO, accent: "text-slate-500" },
    { key: "IN_PROGRESS", label: TASK_STATUS_LABELS.IN_PROGRESS, accent: "text-amber-500" },
    { key: "REVIEW", label: TASK_STATUS_LABELS.REVIEW, accent: "text-sky-500" },
    { key: "ON_HOLD", label: TASK_STATUS_LABELS.ON_HOLD, accent: "text-rose-500" },
    { key: "overdue", label: "Overdue", accent: "text-red-600" },
    { key: "soon", label: "Due soon", accent: "text-orange-500" },
    { key: "DONE", label: TASK_STATUS_LABELS.DONE, accent: "text-emerald-500" },
  ];

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you across your projects."
        breadcrumbs={[
          { label: workspaceLabel, to: workspaceBase },
          { label: "My Tasks" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActiveRangeBadge range={range} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or code…"
                className="h-9 w-44 pl-8"
                aria-label="Search tasks"
              />
            </div>
            {versions.length > 0 && (
              <MultiSelectFilter
                label="Version"
                options={versions.map((ver) => ({ value: ver, label: `v${ver}` }))}
                selected={versionFilter}
                onChange={setVersionFilter}
                className="w-32"
              />
            )}
            <Select value={sortBy} onValueChange={(v) => setSortBy((v ?? "due") as typeof sortBy)}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Sort: Due date</SelectItem>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="version">Sort: Version</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter value={range} onChange={setRange} presets={TASK_DUE_PRESETS} />
          </div>
        }
      />

      {/* At-a-glance summary that doubles as a quick filter. */}
      {!loading && !error && tasks.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {SUMMARY.map((s) => {
            const active = view === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setView(active && s.key !== "all" ? "all" : s.key)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border/60 hover:bg-muted/50",
                )}
              >
                <span className={cn("text-xl font-bold tabular-nums leading-none", s.accent)}>
                  {counts[s.key] ?? 0}
                </span>
                <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {loading ? (
          <LoadingState label="Loading tasks…" />
        ) : error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load tasks"
              description={error}
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={ClipboardList}
              title={tasks.length === 0 ? "No tasks assigned" : "No matching tasks"}
              description={
                tasks.length === 0
                  ? "Tasks assigned to you will appear here."
                  : "Try clearing the search or filters."
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((task) => (
                    <TableRow
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {task.code ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate font-medium text-foreground">{task.title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {task.description || "No description"}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{projectLabel(task)}</TableCell>
                      <TableCell>
                        <TaskPriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell>
                        <DueDate dueDate={task.dueDate} status={task.status} />
                      </TableCell>
                      {/* Don't open the dialog when interacting with the control. */}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <TaskStatusControl
                          status={task.status}
                          onChange={(s, reason) => handleStatusChange(task.id, s, reason)}
                          busy={updatingId === task.id}
                          allowed={task.status === "DONE" ? [] : EMPLOYEE_ALLOWED}
                          reasonRequired={["ON_HOLD"]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile: list-based task cards (tap to open details). */}
            <ul className="flex flex-col divide-y md:hidden">
              {sorted.map((task) => (
                <li
                  key={task.id}
                  className="flex cursor-pointer flex-col gap-2 p-4 active:bg-muted/40"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-foreground">{task.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {task.code ? `${task.code} · ` : ""}
                        {task.description || "No description"}
                      </p>
                    </div>
                    <TaskPriorityBadge priority={task.priority} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{projectLabel(task)}</span>
                    <DueDate dueDate={task.dueDate} status={task.status} />
                    {task.version && <span>v{task.version}</span>}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <TaskStatusControl
                      status={task.status}
                      onChange={(s, reason) => handleStatusChange(task.id, s, reason)}
                      busy={updatingId === task.id}
                      allowed={task.status === "DONE" ? [] : EMPLOYEE_ALLOWED}
                      reasonRequired={["ON_HOLD"]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Full task details: description, assignees, attachments, comments. */}
      <TaskDetailsDialog
        task={selectedTask}
        projectName={selectedTask ? projectLabel(selectedTask) : ""}
        getAssigneeName={getAssigneeName}
        onOpenChange={(open) => !open && setSelectedTask(null)}
      />
    </>
  );
}
