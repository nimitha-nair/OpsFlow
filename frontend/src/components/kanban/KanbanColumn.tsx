import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { Task, TaskStatus } from "../../types/task";

/** Per-column status accent dot. */
const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-sky-500",
  DONE: "bg-emerald-500",
};

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  getAssigneeName: (id: string) => string;
  getProjectName: (id: string) => string;
  canMove: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen?: (task: Task) => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  getAssigneeName,
  getProjectName,
  canMove,
  selectable,
  selectedIds,
  onToggleSelect,
  onOpen,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-muted/30 transition-colors",
        isOver && "border-primary/40",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
          {title}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors",
          isOver && "bg-primary/5 outline-2 outline-dashed outline-primary/30 -outline-offset-4",
        )}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              No tasks
            </p>
          ) : (
            tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                assigneeName={getAssigneeName(task.assigneeId)}
                projectName={getProjectName(task.projectId)}
                canMove={canMove}
                selectable={selectable}
                selected={selectedIds?.has(task.id)}
                onToggleSelect={onToggleSelect}
                onOpen={onOpen}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
