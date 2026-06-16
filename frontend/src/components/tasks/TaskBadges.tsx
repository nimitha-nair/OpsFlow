import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../../types/task";

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  CRITICAL: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  TODO: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  IN_PROGRESS:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  DONE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
};

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge className={cn("border-transparent", PRIORITY_STYLES[priority])}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge className={cn("border-transparent", STATUS_STYLES[status])}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}
