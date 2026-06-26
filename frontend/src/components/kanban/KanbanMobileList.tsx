import { useState } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
import { assignmentLabel } from "../tasks/AssigneeDisplay";
import { TaskMoveSheet } from "./TaskMoveSheet";
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
 * Touch-first mobile board. One status "column" is shown at a time via a
 * horizontally-scrollable status switcher (with live counts); tapping a card
 * opens the move bottom-sheet (big tappable status rows) — no drag, no tiny
 * congested columns, no horizontal card scrolling.
 */
export function KanbanMobileList({
  tasks,
  getAssigneeName,
  getProjectName,
  canMove,
  onMove,
  onOpen,
}: KanbanMobileListProps) {
  const [activeStatus, setActiveStatus] = useState<TaskStatus>(
    () => TASK_STATUSES.find((s) => tasks.some((t) => t.status === s)) ?? "TODO",
  );
  const [moveTask, setMoveTask] = useState<Task | null>(null);

  const items = tasks.filter((t) => t.status === activeStatus);

  return (
    <div className="flex flex-col gap-3 md:hidden">
      {/* Status switcher — swipeable chips with live counts. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TASK_STATUSES.map((s) => {
          const n = tasks.filter((t) => t.status === s).length;
          const active = s === activeStatus;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setActiveStatus(s)}
              aria-pressed={active}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 text-muted-foreground active:bg-muted/60",
              )}
            >
              <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
              {TASK_STATUS_LABELS[s]}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
          No {TASK_STATUS_LABELS[activeStatus].toLowerCase()} tasks.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => (canMove ? setMoveTask(task) : onOpen(task))}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-left transition-colors active:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium text-foreground">{task.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {getProjectName(task.projectId)} ·{" "}
                    {assignmentLabel(task.assignment, getAssigneeName)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <TaskPriorityBadge priority={task.priority} />
                    <DueDate dueDate={task.dueDate} status={task.status} />
                  </div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <TaskMoveSheet
        task={moveTask}
        getProjectName={getProjectName}
        reasonRequired={["ON_HOLD"]}
        onMove={onMove}
        onOpenDetails={onOpen}
        onOpenChange={(o) => !o && setMoveTask(null)}
      />
    </div>
  );
}
