import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
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
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { DueDate } from "../../components/tasks/DueDate";
import { makeRange, rangeToParams, type DateRange } from "../../lib/date-range";
import { TaskPriorityBadge } from "../../components/tasks/TaskBadges";
import { TaskStatusControl } from "../../components/tasks/TaskStatusControl";
import { listMyProjects } from "../../lib/projects-api";
import {
  apiErrorMessage,
  listMyTasks,
  updateTaskStatus,
} from "../../lib/tasks-api";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "../../types/task";

export function MyTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"due" | "version" | "priority">("due");

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
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? updated : t)),
      );
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

  const versions = useMemo(
    () =>
      [...new Set(tasks.map((t) => t.version).filter((v): v is string => Boolean(v)))].sort(),
    [tasks],
  );

  const sorted = useMemo(() => {
    let list = [...tasks];
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (versionFilter !== "all") list = list.filter((t) => t.version === versionFilter);
    const priorityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    list.sort((a, b) => {
      if (sortBy === "version")
        return (a.version ?? "").localeCompare(b.version ?? "", undefined, { numeric: true });
      if (sortBy === "priority")
        return (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9);
      return a.dueDate.localeCompare(b.dueDate);
    });
    return list;
  }, [tasks, statusFilter, versionFilter, sortBy]);

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you across your projects."
        breadcrumbs={[
          { label: "Employee", to: "/employee" },
          { label: "My Tasks" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActiveRangeBadge range={range} />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter((v ?? "all") as TaskStatus | "all")}
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
            {versions.length > 0 && (
              <Select
                value={versionFilter}
                onValueChange={(v) => setVersionFilter(v ?? "all")}
              >
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
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy((v ?? "due") as typeof sortBy)}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="due">Sort: Due date</SelectItem>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="version">Sort: Version</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        }
      />

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
              title={tasks.length === 0 ? "No tasks assigned" : "No tasks in range"}
              description={
                tasks.length === 0
                  ? "Tasks assigned to you will appear here."
                  : "No tasks are due in the selected date range."
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="max-w-xs">
                      <div className="font-medium text-foreground">
                        {task.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {task.description}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {projectNames.get(task.projectId) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <TaskPriorityBadge priority={task.priority} />
                    </TableCell>
                    <TableCell>
                      <DueDate dueDate={task.dueDate} status={task.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.version ? `v${task.version}` : "—"}
                    </TableCell>
                    <TableCell>
                      <TaskStatusControl
                        status={task.status}
                        onChange={(s, reason) =>
                          handleStatusChange(task.id, s, reason)
                        }
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

            {/* Mobile: list-based task cards */}
            <ul className="flex flex-col divide-y md:hidden">
              {sorted.map((task) => (
                <li key={task.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
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
                    <TaskStatusControl
                      status={task.status}
                      onChange={(s, reason) =>
                        handleStatusChange(task.id, s, reason)
                      }
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
    </>
  );
}
