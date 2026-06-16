import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
import type { Task } from "../../types/task";

interface CardInnerProps {
  task: Task;
  assigneeName: string;
  canMove: boolean;
}

function CardInner({ task, assigneeName, canMove }: CardInnerProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{task.title}</p>
        {canMove && (
          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{assigneeName}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <TaskPriorityBadge priority={task.priority} />
        <DueDate dueDate={task.dueDate} status={task.status} />
      </div>
    </>
  );
}

const cardClasses =
  "rounded-lg border border-border bg-card p-3 text-sm shadow-sm";

/** Static card used by the drag overlay (no sortable registration). */
export function KanbanCardView({ task, assigneeName, canMove }: CardInnerProps) {
  return (
    <div className={cn(cardClasses, "rotate-2 shadow-lg")}>
      <CardInner task={task} assigneeName={assigneeName} canMove={canMove} />
    </div>
  );
}

/** Draggable card registered with dnd-kit sortable. */
export function KanbanCard({ task, assigneeName, canMove }: CardInnerProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { status: task.status },
    disabled: !canMove,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        cardClasses,
        canMove && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      {...(canMove ? attributes : {})}
      {...(canMove ? listeners : {})}
    >
      <CardInner task={task} assigneeName={assigneeName} canMove={canMove} />
    </div>
  );
}
