import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDate } from "../../lib/format";
import type { TaskStatus } from "../../types/task";

/** Whether a due date has passed (and the task is not yet done). */
function isOverdue(dueDate: string, status: TaskStatus): boolean {
  if (status === "DONE") return false;
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return false;
  // Compare on date-only granularity (end of due day).
  return due + 24 * 60 * 60 * 1000 <= Date.now();
}

export function DueDate({
  dueDate,
  status,
}: {
  dueDate: string;
  status: TaskStatus;
}) {
  const overdue = isOverdue(dueDate, status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-sm",
        overdue ? "font-medium text-destructive" : "text-muted-foreground",
      )}
    >
      <CalendarClock className="size-3.5" />
      {formatDate(dueDate)}
      {overdue && <span className="text-xs">(overdue)</span>}
    </span>
  );
}
