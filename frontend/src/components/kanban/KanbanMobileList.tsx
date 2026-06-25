import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
import { TaskStatusControl } from "../tasks/TaskStatusControl";
import { assignmentLabel } from "../tasks/AssigneeDisplay";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "../../types/task";

const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-sky-500",
  ON_HOLD: "bg-amber-500",
  REVIEW: "bg-violet-500",
  DONE: "bg-emerald-500",
};

interface KanbanMobileListProps {
  tasks: Task[];
  getAssigneeName: (id: string) => string;
  getProjectName: (id?: string) => string;
  canMove: boolean;
  onMove: (taskId: string, status: TaskStatus, reason?: string) => void;
  onOpen: (task: Task) => void;
}

/**
 * Mobile board: status-grouped, collapsible vertical list of task cards — the
 * touch-friendly alternative to the horizontally-scrolling desktop columns.
 * Status is changed via the chip control (no drag, no horizontal scroll).
 */
export function KanbanMobileList({
  tasks,
  getAssigneeName,
  getProjectName,
  canMove,
  onMove,
  onOpen,
}: KanbanMobileListProps) {
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());

  function toggle(status: TaskStatus) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {TASK_STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status);
        const isCollapsed = collapsed.has(status);
        return (
          <div key={status} className="rounded-xl border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => toggle(status)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
                {TASK_STATUS_LABELS[status]}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  isCollapsed && "-rotate-90",
                )}
              />
            </button>

            {!isCollapsed && (
              <ul className="flex flex-col gap-2 px-2 pb-2">
                {items.length === 0 ? (
                  <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                    No tasks
                  </li>
                ) : (
                  items.map((task) => (
                    <li
                      key={task.id}
                      className="rounded-lg border border-border bg-background p-3"
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(task)}
                        className="block w-full text-left"
                      >
                        <p className="break-words font-medium text-foreground">{task.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {getProjectName(task.projectId)} ·{" "}
                          {assignmentLabel(task.assignment, getAssigneeName)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <TaskPriorityBadge priority={task.priority} />
                          <DueDate dueDate={task.dueDate} status={task.status} />
                        </div>
                      </button>
                      {canMove && (
                        <div className="mt-2">
                          <TaskStatusControl
                            status={task.status}
                            onChange={(s, reason) => onMove(task.id, s, reason)}
                            reasonRequired={["ON_HOLD"]}
                          />
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
