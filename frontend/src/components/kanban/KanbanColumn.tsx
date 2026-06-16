import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { Task, TaskStatus } from "../../types/task";

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  getAssigneeName: (id: string) => string;
  getProjectName: (id: string) => string;
  canMove: boolean;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  getAssigneeName,
  getProjectName,
  canMove,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 p-2 transition-colors",
          isOver && "bg-primary/5",
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
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
