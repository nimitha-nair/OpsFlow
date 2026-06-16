import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { projectColor } from "../../lib/project-color";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
import type { Task } from "../../types/task";

interface CardInnerProps {
  task: Task;
  assigneeName: string;
  projectName: string;
  canMove: boolean;
}

function CardInner({ task, assigneeName, projectName, canMove }: CardInnerProps) {
  const color = projectColor(task.projectId);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            color.badge,
          )}
          title={projectName}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", color.dot)} />
          <span className="truncate">{projectName}</span>
        </span>
        {canMove && (
          <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
      </div>
      <p className="mt-2 font-medium text-foreground">{task.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{assigneeName}</p>
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
export function KanbanCardView(props: CardInnerProps) {
  return (
    <div className={cn(cardClasses, "rotate-2 shadow-lg")}>
      <CardInner {...props} />
    </div>
  );
}

/** Draggable card registered with dnd-kit sortable. */
export function KanbanCard(props: CardInnerProps) {
  const { task, canMove } = props;
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
      <CardInner {...props} />
    </div>
  );
}
