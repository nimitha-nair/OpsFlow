import { useEffect, useMemo, useRef, useState } from "react";
import { GanttChart, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { ActiveRangeBadge } from "../components/common/ActiveRangeBadge";
import { CalendarView } from "../components/kanban/CalendarView";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { KanbanMobileList } from "../components/kanban/KanbanMobileList";
import { TaskDetailsDialog } from "../components/kanban/TaskDetailsDialog";
import { TimelineView } from "../components/kanban/TimelineView";
import { MobileBottomActionBar } from "../components/mobile/MobileBottomActionBar";
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
import {
  makeRange,
  rangeToParams,
  TASK_DUE_PRESETS,
  type DateRange,
} from "../lib/date-range";
import { fuzzyMatchAny } from "../lib/fuzzy";
import { useAuth } from "../context/auth-context";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
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
  const isHR = user?.role === "HR";
  const isAdmin = user?.role === "ADMIN";
  // Everyone may move tasks on this board. HR now sees a personal board
  // (own + HR-department tasks); the backend enforces that non-admins can only
  // act on their own/department tasks.
  const canMove = true;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<NamedProject[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [depts, setDepts] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Skeleton shows only on the first load; later refreshes update in place.
  const loadedOnce = useRef(false);

  const availableViews: SavedView[] =
    isEmployee || isHR
      ? ["my", "completed"]
      : ["my", "team", "department", "completed"];

  const [savedView, setSavedView] = useState<SavedView>(
    isEmployee || isHR ? "my" : "team",
  );
  const [boardView, setBoardView] = useState<BoardView>("board");
  const [search, setSearch] = useState("");
  // Multi-select filters: empty array = no filter (all). Values OR within a
  // field; different fields AND together.
  const [priority, setPriority] = useState<TaskPriority[]>([]);
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>([]);
  // Multi-select: empty = all; several = OR within field.
  const [versionFilter, setVersionFilter] = useState<string[]>([]);
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
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
  // ON_HOLD requires a reason; this drives the prompt for desktop drag/bulk moves.
  const [holdPrompt, setHoldPrompt] = useState<{ ids: string[] } | null>(null);
  const [holdReason, setHoldReason] = useState("");

  useEffect(() => {
    if (!user) return;
    const self = user;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const dateParams = rangeToParams(range);
        // Only ADMIN gets the org-wide oversight board; EMPLOYEE and HR see a
        // personal board (own + their department's tasks, resolved server-side).
        const personalBoard = self.role !== "ADMIN";
        const [taskList, projectList] = await Promise.all([
          personalBoard
            ? listMyTasks(dateParams)
            : listTasks({ limit: 100, ...dateParams, basis: taskBasis }),
          personalBoard
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
        if (!cancelled) {
          setLoading(false);
          loadedOnce.current = true;
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user, reloadKey, range, taskBasis]);

  // Near-live: silently refetch on an interval + when the tab refocuses.
  useAutoRefresh(() => setReloadKey((k) => k + 1));

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const getAssigneeName = useMemo(
    () => (id: string) => names.get(id) ?? "Unknown",
    [names],
  );
  const getProjectName = useMemo(
    () => (id?: string) => (id ? (projectNames.get(id) ?? "—") : "General"),
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

  // The current user's department (resolved from the loaded user map), used to
  // include their department's tasks in the "my" view.
  const myDepartment = useMemo(
    () => (user ? depts.get(user.id) : undefined),
    [user, depts],
  );

  /** Resolve the department a task belongs to. */
  const taskDepartment = useMemo(
    () =>
      (t: Task): string | undefined =>
        t.assignment.type === "DEPARTMENT"
          ? t.assignment.department
          : depts.get(t.assignment.userIds[0] ?? ""),
    [depts],
  );

  /** Apply a saved view to the raw task list. */
  const applyView = useMemo(
    () =>
      (list: Task[], view: SavedView): Task[] => {
        switch (view) {
          case "my":
            return list.filter(
              (t) =>
                (user?.id != null && t.assignment.userIds.includes(user.id)) ||
                (t.assignment.type === "DEPARTMENT" &&
                  myDepartment != null &&
                  t.assignment.department === myDepartment),
            );
          case "completed":
            return list.filter((t) => t.status === "DONE");
          case "department":
            return departmentFilter === "all"
              ? list
              : list.filter((t) => taskDepartment(t) === departmentFilter);
          case "team":
          default:
            return list;
        }
      },
    [user?.id, myDepartment, departmentFilter, taskDepartment],
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
    if (projectFilter.length) list = list.filter((t) => projectFilter.includes(t.projectId ?? ""));
    if (priority.length) list = list.filter((t) => priority.includes(t.priority));
    if (statusFilter.length)
      list = list.filter((t) => statusFilter.includes(t.status));
    if (versionFilter.length) list = list.filter((t) => versionFilter.includes(t.version ?? ""));
    const q = search.trim();
    if (q) {
      // Fuzzy search across title, assignee, project, status, and version.
      list = list.filter((t) =>
        fuzzyMatchAny(q, [
          t.title,
          ...t.assignment.userIds.map(getAssigneeName),
          t.assignment.department,
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

  // Entry point for all moves. A move to ON_HOLD without a reason (desktop drag)
  // opens the reason prompt instead of moving; everything else moves directly.
  async function handleMoveTask(
    taskId: string,
    status: TaskStatus,
    reason?: string,
  ) {
    if (status === "ON_HOLD" && !reason) {
      const current = tasks.find((t) => t.id === taskId);
      if (!current || current.status === status) return;
      setHoldReason("");
      setHoldPrompt({ ids: [taskId] });
      return;
    }
    await applyMove(taskId, status, reason);
  }

  async function applyMove(
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

  // Apply the shared reason to every task queued for hold (single drag or bulk).
  async function confirmHold() {
    const reason = holdReason.trim();
    if (!holdPrompt || !reason) return;
    const ids = holdPrompt.ids;
    setHoldPrompt(null);
    setHoldReason("");
    for (const id of ids) {
      await applyMove(id, "ON_HOLD", reason);
    }
    if (ids.length > 1) {
      toast.success(`Moved ${ids.length} tasks to ${TASK_STATUS_LABELS.ON_HOLD}.`);
    }
  }

  async function openEdit(task: Task) {
    setSelectedTask(null);
    setEditTask(task);
    try {
      if (task.projectId) {
        const ms = await listProjectMembers(task.projectId);
        setEditMembers(
          ms.map((m) => ({
            id: m.userId,
            name: m.user?.name ?? "Unknown",
            department: m.user?.department,
          })),
        );
      } else {
        // General (project-less) task: eligible assignees are all active users.
        const us = await listUsers({ limit: 1000 });
        setEditMembers(
          us.data
            .filter((u) => u.isActive !== false)
            .map((u) => ({ id: u.id, name: u.name, department: u.department })),
        );
      }
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
    // ON_HOLD needs one shared reason — prompt once, then apply to all on confirm.
    if (status === "ON_HOLD") {
      setHoldReason("");
      setHoldPrompt({ ids });
      return;
    }
    for (const id of ids) {
      await applyMove(id, status);
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
                isAdmin
                  ? taskBasis === "createdAt"
                    ? "Created"
                    : "Due"
                  : undefined
              }
            />
            {isAdmin && (
              <Button size="sm" onClick={() => setQuickOpen(true)}>
                <Plus className="size-4" />
                New Task
              </Button>
            )}
          </div>
        }
      />

      {loading && !loadedOnce.current ? (
        <LoadingState label="Loading tasks…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load Kanban"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-6">
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
            // Task/board views always offer future-facing windows (upcoming due work).
            datePresets={TASK_DUE_PRESETS}
            dateBasis={
              isAdmin ? { value: taskBasis, onChange: setTaskBasis } : undefined
            }
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
                  onOpen={setSelectedTask}
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
        <>
          {/* Desktop: centered floating pill (unchanged). */}
          <div className="no-print fixed inset-x-0 bottom-6 z-40 hidden justify-center px-4 md:flex">
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

          {/* Mobile: full-width bar; the move-to chips scroll horizontally. */}
          <MobileBottomActionBar className="flex-col items-stretch gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {activeSelection.length} selected
              </span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Clear selection"
                className="ml-auto"
                onClick={() => setSelectedIds(new Set())}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
              <span className="shrink-0 text-xs text-muted-foreground">
                Move to
              </span>
              {TASK_STATUSES.map((status) => (
                <Button
                  key={status}
                  size="xs"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => bulkMove(status)}
                >
                  {TASK_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </MobileBottomActionBar>
        </>
      )}

      <TaskDetailsDialog
        task={selectedTask}
        projectName={selectedTask ? getProjectName(selectedTask.projectId) : ""}
        getAssigneeName={getAssigneeName}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
        canManage={isAdmin}
        onEdit={openEdit}
        onReopen={reopenTask}
        onDelete={removeTask}
      />

      <Dialog
        open={holdPrompt !== null}
        onOpenChange={(o) => {
          if (!o) {
            setHoldPrompt(null);
            setHoldReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Put{" "}
              {holdPrompt && holdPrompt.ids.length > 1
                ? `${holdPrompt.ids.length} tasks`
                : "task"}{" "}
              on hold
            </DialogTitle>
            <DialogDescription>
              Add a short reason so the team knows why{" "}
              {holdPrompt && holdPrompt.ids.length > 1 ? "they're" : "it's"} paused.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="kanban-hold-reason">Reason</Label>
            <Textarea
              id="kanban-hold-reason"
              rows={3}
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Blocked on design approval"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setHoldPrompt(null);
                setHoldReason("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmHold} disabled={holdReason.trim() === ""}>
              Put on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
