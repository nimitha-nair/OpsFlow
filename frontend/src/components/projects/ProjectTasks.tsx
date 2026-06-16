import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import {
  TaskPriorityBadge,
  TaskStatusBadge,
} from "../tasks/TaskBadges";
import {
  TaskFormDialog,
  type AssigneeOption,
} from "../tasks/TaskFormDialog";
import { DueDate } from "../tasks/DueDate";
import { listProjectMembers } from "../../lib/project-members-api";
import { apiErrorMessage, listTasks } from "../../lib/tasks-api";
import type { Task } from "../../types/task";

interface ProjectTasksProps {
  projectId: string;
  /** When true (HR view), hides create/edit controls. */
  readOnly?: boolean;
  /** Bump to force a refetch (coordinated refresh across project sections). */
  refreshKey?: number;
  /** Called after a successful mutation so sibling sections can refetch too. */
  onMutated?: () => void;
}

export function ProjectTasks({
  projectId,
  readOnly,
  refreshKey,
  onMutated,
}: ProjectTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [taskList, memberList] = await Promise.all([
          listTasks({ projectId, limit: 100 }),
          listProjectMembers(projectId),
        ]);
        if (cancelled) return;
        setTasks(taskList);
        setMembers(
          memberList.map((m) => ({
            id: m.userId,
            name: m.user?.name ?? m.userId,
          })),
        );
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
  }, [projectId, reloadKey, refreshKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const notify = () => (onMutated ? onMutated() : reload());

  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  );

  function openCreate() {
    setEditTask(undefined);
    setDialogOpen(true);
  }
  function openEdit(task: Task) {
    setEditTask(task);
    setDialogOpen(true);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          Tasks
          {!loading && !error && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({tasks.length})
            </span>
          )}
        </CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            New Task
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState compact label="Loading tasks…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load tasks"
            description={error}
            onRetry={reload}
          />
        ) : tasks.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title="No tasks yet"
            description={
              readOnly
                ? "Tasks for this project will appear here."
                : "Create a task and assign it to a team member."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due</TableHead>
                  {!readOnly && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium text-foreground">
                      {task.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nameById.get(task.assigneeId) ?? task.assigneeId}
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
                    {!readOnly && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(task)}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {!readOnly && (
        <TaskFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editTask ? "edit" : "create"}
          projectId={projectId}
          members={members}
          task={editTask}
          onSaved={notify}
        />
      )}
    </Card>
  );
}
