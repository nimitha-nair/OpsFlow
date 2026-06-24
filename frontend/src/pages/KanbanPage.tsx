import { useEffect, useMemo, useState } from "react";
import { GanttChart, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { CalendarClock, CalendarPlus } from "lucide-react";

import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { DateBasisToggle } from "../components/common/DateBasisToggle";
import { CalendarView } from "../components/kanban/CalendarView";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { KanbanMobileList } from "../components/kanban/KanbanMobileList";
import { TaskDetailsDialog } from "../components/kanban/TaskDetailsDialog";
import { TimelineView } from "../components/kanban/TimelineView";
import {
  KanbanToolbar,
  type BoardView,
  type SavedView,
} from "../components/kanban/KanbanToolbar";
import { QuickCreateTaskDialog } from "../components/tasks/QuickCreateTaskDialog";
import {
  TaskFormDialog,
  type AssigneeOption,
} from "../components/tasks/TaskFormDialog";
import { listProjectMembers } from "../lib/project-members-api";
import { makeRange, rangeToParams, type DateRange } from "../lib/date-range";
import { fuzzyMatchAny } from "../lib/fuzzy";
import { useAuth } from "../context/auth-context";
import { listMyProjects, listProjects } from "../lib/projects-api";
import {
  apiErrorMessage,
  deleteTask,
  listMyTasks,
  listTasks,
  updateTaskStatus,
} from "../lib/tasks-api";
import { listUsers } from "../lib/users-api";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../types/task";

interface NamedProject {
  id: string;
  name: string;
}

export function KanbanPage() {
  const { user } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  const isAdmin = user?.role === "ADMIN";
  // HR is view-only; ADMIN and the assigned EMPLOYEE may move tasks.
  const canMove = user?.role !== "HR";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<NamedProject[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [depts, setDepts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const availableViews: SavedView[] = isEmployee
    ? ["my", "completed"]
    : ["my", "team", "department", "completed"];

  const [savedView, setSavedView] = useState<SavedView>(isEmployee ? "my" : "team");
  const [boardView, setBoardView] = useState<BoardView>("board");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));
  // Board is an activity view: default the range to the task's CREATED date so
  // "Today" shows recently-added work, not only tasks that happen to be due today.
  const [taskBasis, setTaskBasis] = useState<"dueDate" | "createdAt">(
    "createdAt",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editMembers, setEditMembers] = useState<AssigneeOption[]>([]);

  useEffect(() => {
    if (!user) return;
    const self = user;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dateParams = rangeToParams(range);
        const [taskList, projectList] = await Promise.all([
          self.role === "EMPLOYEE"
            ? listMyTasks(dateParams)
            : listTasks({ limit: 100, ...dateParams, basis: taskBasis }),
          self.role === "EMPLOYEE"
            ? listMyProjects()
            : listProjects({ limit: 100 }).then((r) => r.data),
        ]);

        let nameMap: Map<string, string>;
        let deptMap = new Map<string, string>();
        if (self.role === "EMPLOYEE") {
          nameMap = new Map([[self.id, self.name]]);
        } else {
          const users = await listUsers({ limit: 1000 });
          nameMap = new Map(users.data.map((u) => [u.id, u.name]));
          deptMap = new Map(
            users.data.map((u) => [u.id, u.department?.trim() || "Unassigned"]),
          );
        }

        if (cancelled) return;
        setTasks(taskList);
        setProjects(projectList.map((p) => ({ id: p.id, name: p.name })));
        setNames(nameMap);
        setDepts(deptMap);
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
  }, [user, reloadKey, range, taskBasis]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const getAssigneeName = useMemo(
    () => (id: string) => names.get(id) ?? "Unknown",
    [names],
  );
  const getProjectName = useMemo(
    () => (id: string) => projectNames.get(id) ?? "—",
    [projectNames],
  );

  const departments = useMemo(
    () => [...new Set([...depts.values()])].sort(),
    [depts],
  );
  const versions = useMemo(
    () =>
      [...new Set(tasks.map((t) => t.version).filter((v): v is string => Boolean(v)))].sort(),
    [tasks],
  );

  /** Apply a saved view to the raw task list. */
  const applyView = useMemo(
    () =>
      (list: Task[], view: SavedView): Task[] => {
        switch (view) {
          case "my":
            return list.filter((t) => t.assigneeId === user?.id);
          case "completed":
            return list.filter((t) => t.status === "DONE");
          case "department":
            return departmentFilter === "all"
              ? list
              : list.filter((t) => depts.get(t.assigneeId) === departmentFilter);
          case "team":
          default:
            return list;
        }
      },
    [user?.id, departmentFilter, depts],
  );

  const viewsKey = availableViews.join(",");
  const viewCounts = useMemo(() => {
    const counts = {} as Record<SavedView, number>;
    for (const v of availableViews) counts[v] = applyView(tasks, v).length;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, applyView, viewsKey]);

  const filteredTasks = useMemo(() => {
    let list = applyView(tasks, savedView);
    if (projectFilter !== "all") list = list.filter((t) => t.projectId === projectFilter);
    if (priority !== "all") list = list.filter((t) => t.priority === priority);
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (versionFilter !== "all") list = list.filter((t) => t.version === versionFilter);
    const q = search.trim();
    if (q) {
      // Fuzzy search across title, assignee, project, status, and version.
      list = list.filter((t) =>
        fuzzyMatchAny(q, [
          t.title,
          getAssigneeName(t.assigneeId),
          getProjectName(t.projectId),
          TASK_STATUS_LABELS[t.status],
          t.version,
        ]),
      );
    }
    return list;
  }, [
    applyView,
    tasks,
    savedView,
    projectFilter,
    priority,
    statusFilter,
    versionFilter,
    search,
    getAssigneeName,
    getProjectName,
  ]);

  // Keep the selection consistent with what's actually visible.
  const visibleIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks]);
  const activeSelection = useMemo(
    () => [...selectedIds].filter((id) => visibleIds.has(id)),
    [selectedIds, visibleIds],
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMoveTask(
    taskId: string,
    status: TaskStatus,
    reason?: string,
  ) {
    const previous = tasks;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;

    if (current.status === "DONE" && isEmployee) {
      toast.error("This task is completed and read-only. Ask an admin to reopen it.");
      return;
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      const updated = await updateTaskStatus(taskId, status, reason);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setTasks(previous);
      toast.error(apiErrorMessage(err, "Failed to move task."));
    }
  }

  async function openEdit(task: Task) {
    setSelectedTask(null);
    setEditTask(task);
    try {
      const ms = await listProjectMembers(task.projectId);
      setEditMembers(ms.map((m) => ({ id: m.userId, name: m.user?.name ?? "Unknown" })));
    } catch {
      setEditMembers([]);
    }
  }

  function reopenTask(task: Task) {
    setSelectedTask(null);
    void handleMoveTask(task.id, "IN_PROGRESS");
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setSelectedTask(null);
    try {
      await deleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Task deleted.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to delete task."));
    }
  }

  async function bulkMove(status: TaskStatus) {
    const ids = [...activeSelection];
    setSelectedIds(new Set());
    for (const id of ids) {
      await handleMoveTask(id, status);
    }
    toast.success(`Moved ${ids.length} task${ids.length === 1 ? "" : "s"} to ${TASK_STATUS_LABELS[status]}.`);
  }

  return (
    <>
      <PageHeader
        title="Kanban"
        description={
          isEmployee
            ? "Your assigned work across board, calendar, and timeline."
            : "Plan and track work across saved views and visualizations."
        }
        breadcrumbs={[{ label: "Kanban" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ActiveRangeBadge
              range={range}
              basisLabel={
                isEmployee
                  ? undefined
                  : taskBasis === "createdAt"
                    ? "Created"
                    : "Due"
              }
            />
            {!isEmployee && (
              <DateBasisToggle
                value={taskBasis}
                onChange={setTaskBasis}
                options={[
                  { value: "dueDate", label: "Due date", Icon: CalendarClock },
                  {
                    value: "createdAt",
                    label: "Created date",
                    Icon: CalendarPlus,
                  },
                ]}
              />
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => setQuickOpen(true)}>
                <Plus className="size-4" />
                New Task
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <LoadingState label="Loading tasks…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load Kanban"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <KanbanToolbar
            views={availableViews}
            activeView={savedView}
            onViewChange={setSavedView}
            search={search}
            onSearch={setSearch}
            priority={priority}
            onPriority={setPriority}
            status={statusFilter}
            onStatus={setStatusFilter}
            versions={versions}
            versionFilter={versionFilter}
            onVersion={setVersionFilter}
            projects={projects}
            projectFilter={projectFilter}
            onProject={setProjectFilter}
            showDepartment={!isEmployee && savedView === "department"}
            departments={departments}
            departmentFilter={departmentFilter}
            onDepartment={setDepartmentFilter}
            dateRange={range}
            onDateRange={setRange}
            boardView={boardView}
            onBoardView={setBoardView}
            counts={viewCounts}
          />

          {filteredTasks.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <EmptyState
                  icon={GanttChart}
                  title="No tasks match"
                  description="Try a different view or clear your filters."
                />
              </CardContent>
            </Card>
          ) : boardView === "board" ? (
            <>
              {/* Desktop: horizontal board */}
              <div className="hidden md:block">
                <KanbanBoard
                  tasks={filteredTasks}
                  getAssigneeName={getAssigneeName}
                  getProjectName={getProjectName}
                  canMove={canMove}
                  onMoveTask={handleMoveTask}
                  selectable={canMove}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelect}
                />
              </div>
              {/* Mobile: status-grouped vertical list */}
              <KanbanMobileList
                tasks={filteredTasks}
                getAssigneeName={getAssigneeName}
                getProjectName={getProjectName}
                canMove={canMove}
                onMove={handleMoveTask}
                onOpen={setSelectedTask}
              />
            </>
          ) : boardView === "calendar" ? (
            <Card>
              <CardContent className="pt-6">
                <CalendarView tasks={filteredTasks} onTaskClick={setSelectedTask} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <TimelineView
                  tasks={filteredTasks}
                  getProjectName={getProjectName}
                  onTaskClick={setSelectedTask}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {canMove && activeSelection.length > 0 && (
        <div className="no-print fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-popover px-4 py-2.5 shadow-lg ring-1 ring-foreground/10">
            <span className="text-sm font-medium text-foreground">
              {activeSelection.length} selected
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">Move to</span>
            {TASK_STATUSES.map((status) => (
              <Button
                key={status}
                size="xs"
                variant="outline"
                onClick={() => bulkMove(status)}
              >
                {TASK_STATUS_LABELS[status]}
              </Button>
            ))}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Clear selection"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <TaskDetailsDialog
        task={selectedTask}
        projectName={selectedTask ? getProjectName(selectedTask.projectId) : ""}
        assigneeName={selectedTask ? getAssigneeName(selectedTask.assigneeId) : ""}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        canManage={isAdmin}
        onEdit={openEdit}
        onReopen={reopenTask}
        onDelete={removeTask}
      />

      <QuickCreateTaskDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onCreated={() => setReloadKey((k) => k + 1)}
      />

      <TaskFormDialog
        open={editTask !== null}
        mode="edit"
        projectId={editTask?.projectId ?? ""}
        members={editMembers}
        task={editTask ?? undefined}
        onOpenChange={(open) => {
          if (!open) setEditTask(null);
        }}
        onSaved={() => {
          setEditTask(null);
          setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
