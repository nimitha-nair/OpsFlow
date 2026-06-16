import { ClipboardList } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "../common/EmptyState";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "../../types/task";

const STATUS_BAR: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  DONE: "bg-emerald-500",
};

export function TaskStatusSummary({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={ClipboardList}
        title="No tasks yet"
        description="Task status breakdown will appear here."
      />
    );
  }

  const total = tasks.length;
  const counts = TASK_STATUSES.map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }));

  return (
    <ul className="flex flex-col gap-3">
      {counts.map(({ status, count }) => (
        <li key={status} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{TASK_STATUS_LABELS[status]}</span>
            <span className="tabular-nums text-muted-foreground">
              {count} / {total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", STATUS_BAR[status])}
              style={{ width: `${total === 0 ? 0 : (count / total) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
