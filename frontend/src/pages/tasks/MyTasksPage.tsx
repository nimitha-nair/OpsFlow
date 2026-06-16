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
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { DueDate } from "../../components/tasks/DueDate";
import { TaskPriorityBadge } from "../../components/tasks/TaskBadges";
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

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [myTasks, myProjects] = await Promise.all([
          listMyTasks(),
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
  }, [reloadKey]);

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    setUpdatingId(taskId);
    try {
      const updated = await updateTaskStatus(taskId, status);
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

  const sorted = useMemo(
    () => [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  );

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you across your projects."
        breadcrumbs={[
          { label: "Employee", to: "/employee" },
          { label: "My Tasks" },
        ]}
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
              title="No tasks assigned"
              description="Tasks assigned to you will appear here."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due</TableHead>
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
                    <TableCell>
                      <Select
                        value={task.status}
                        onValueChange={(v) =>
                          v && handleStatusChange(task.id, v as TaskStatus)
                        }
                        disabled={updatingId === task.id}
                      >
                        <SelectTrigger className="w-36" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TASK_STATUS_LABELS[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
