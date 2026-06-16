import { useEffect, useMemo, useState } from "react";
import { CalendarDays, GanttChart, SquareKanban } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { CalendarView } from "../components/kanban/CalendarView";
import { KanbanBoard } from "../components/kanban/KanbanBoard";
import { TaskDetailsDialog } from "../components/kanban/TaskDetailsDialog";
import { TimelineView } from "../components/kanban/TimelineView";
import { useAuth } from "../context/auth-context";
import { listMyProjects, listProjects } from "../lib/projects-api";
import {
  apiErrorMessage,
  listMyTasks,
  listTasks,
  updateTaskStatus,
} from "../lib/tasks-api";
import { listUsers } from "../lib/users-api";
import type { Task, TaskStatus } from "../types/task";

interface NamedProject {
  id: string;
  name: string;
}

export function KanbanPage() {
  const { user } = useAuth();
  const isEmployee = user?.role === "EMPLOYEE";
  // HR is view-only; ADMIN and the assigned EMPLOYEE may move tasks.
  const canMove = user?.role !== "HR";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<NamedProject[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [view, setView] = useState<"board" | "calendar" | "timeline">("board");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!user) return;
    const self = user;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [taskList, projectList] = await Promise.all([
          self.role === "EMPLOYEE" ? listMyTasks() : listTasks({ limit: 100 }),
          self.role === "EMPLOYEE"
            ? listMyProjects()
            : listProjects({ limit: 100 }).then((r) => r.data),
        ]);

        // Assignee names: ADMIN/HR can read the user directory; an EMPLOYEE only
        // sees their own tasks, so their own name is sufficient.
        let nameMap: Map<string, string>;
        if (self.role === "EMPLOYEE") {
          nameMap = new Map([[self.id, self.name]]);
        } else {
          const users = await listUsers({ limit: 100 });
          nameMap = new Map(users.data.map((u) => [u.id, u.name]));
        }

        if (cancelled) return;
        setTasks(taskList);
        setProjects(projectList.map((p) => ({ id: p.id, name: p.name })));
        setNames(nameMap);
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
  }, [user, reloadKey]);

  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const getAssigneeName = useMemo(
    () => (id: string) => names.get(id) ?? id,
    [names],
  );
  const getProjectName = useMemo(
    () => (id: string) => projectNames.get(id) ?? "—",
    [projectNames],
  );

  const filteredTasks = useMemo(
    () =>
      projectFilter === "all"
        ? tasks
        : tasks.filter((t) => t.projectId === projectFilter),
    [tasks, projectFilter],
  );

  async function handleMoveTask(taskId: string, status: TaskStatus) {
    const previous = tasks;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
    );
    try {
      const updated = await updateTaskStatus(taskId, status);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setTasks(previous);
      toast.error(apiErrorMessage(err, "Failed to move task."));
    }
  }

  return (
    <>
      <PageHeader
        title="Kanban"
        description={
          isEmployee
            ? "Visualize your assigned tasks."
            : "Visualize tasks across board, calendar, and timeline."
        }
        breadcrumbs={[{ label: "Kanban" }]}
        actions={
          projects.length > 0 ? (
            <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v ?? "all")}>
              <SelectTrigger className="w-52" size="sm">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
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
        <Tabs
          value={view}
          onValueChange={(v) =>
            setView(v as "board" | "calendar" | "timeline")
          }
        >
          <TabsList>
            <TabsTrigger value="board">
              <SquareKanban className="size-4" />
              Board
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="size-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <GanttChart className="size-4" />
              Timeline
            </TabsTrigger>
          </TabsList>

          <TabsContent value="board" className="mt-4">
            <KanbanBoard
              tasks={filteredTasks}
              getAssigneeName={getAssigneeName}
              getProjectName={getProjectName}
              canMove={canMove}
              onMoveTask={handleMoveTask}
            />
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <CalendarView
                  tasks={filteredTasks}
                  onTaskClick={setSelectedTask}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {filteredTasks.length === 0 ? (
                  <EmptyState
                    icon={GanttChart}
                    title="No tasks to display"
                    description="Tasks will appear on the timeline once they exist."
                  />
                ) : (
                  <TimelineView
                    tasks={filteredTasks}
                    getProjectName={getProjectName}
                    onTaskClick={setSelectedTask}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <TaskDetailsDialog
        task={selectedTask}
        projectName={selectedTask ? getProjectName(selectedTask.projectId) : ""}
        assigneeName={
          selectedTask ? getAssigneeName(selectedTask.assigneeId) : ""
        }
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
      />
    </>
  );
}
