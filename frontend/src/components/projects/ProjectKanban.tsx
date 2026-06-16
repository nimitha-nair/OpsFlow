import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { KanbanBoard } from "../kanban/KanbanBoard";
import { listProjectMembers } from "../../lib/project-members-api";
import {
  apiErrorMessage,
  listMyTasks,
  listTasks,
  updateTaskStatus,
} from "../../lib/tasks-api";
import { TASK_STATUS_LABELS, type Task, type TaskStatus } from "../../types/task";

interface ProjectKanbanProps {
  projectId: string;
  /** Whether drag-and-drop status changes are allowed (false for HR). */
  canMove: boolean;
  /** "all" = project tasks (ADMIN/HR); "mine" = only the user's tasks. */
  source: "all" | "mine";
}

export function ProjectKanban({
  projectId,
  canMove,
  source,
}: ProjectKanbanProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [taskList, memberList] = await Promise.all([
          source === "mine"
            ? listMyTasks().then((all) =>
                all.filter((t) => t.projectId === projectId),
              )
            : listTasks({ projectId, limit: 100 }),
          listProjectMembers(projectId),
        ]);
        if (cancelled) return;
        setTasks(taskList);
        setNames(
          new Map(memberList.map((m) => [m.userId, m.user?.name ?? m.userId])),
        );
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load board."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, source, reloadKey]);

  const getAssigneeName = useMemo(
    () => (id: string) => names.get(id) ?? id,
    [names],
  );

  async function handleMoveTask(taskId: string, status: TaskStatus) {
    const previous = tasks;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === status) return;

    // Optimistic update for an immediate, real-time UI response.
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status } : t)),
    );

    try {
      const updated = await updateTaskStatus(taskId, status);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      toast.success(`Moved to ${TASK_STATUS_LABELS[status]}.`);
    } catch (err) {
      setTasks(previous); // revert on failure
      toast.error(apiErrorMessage(err, "Failed to move task."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Task Board</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState compact label="Loading board…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load board"
            description={error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        ) : (
          <KanbanBoard
            tasks={tasks}
            getAssigneeName={getAssigneeName}
            canMove={canMove}
            onMoveTask={handleMoveTask}
          />
        )}
      </CardContent>
    </Card>
  );
}
