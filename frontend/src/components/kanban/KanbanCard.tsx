import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { projectColor } from "../../lib/project-color";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
import { AssigneeDisplay } from "../tasks/AssigneeDisplay";
import type { Task, TaskPriority } from "../../types/task";

/** Left-edge accent per priority — an at-a-glance urgency signal. */
const PRIORITY_STRIPE: Record<TaskPriority, string> = {
  CRITICAL: "before:bg-rose-500",
  HIGH: "before:bg-amber-500",
  MEDIUM: "before:bg-sky-500",
  LOW: "before:bg-slate-400",
};

const AVATAR_TONES = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-violet-500",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Small initials avatar with a deterministic tone from the name. */
export function AssigneeAvatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const tone = AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]!;
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white",
        tone,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

interface CardInnerProps {
  task: Task;
  getAssigneeName: (id: string) => string;
  projectName: string;
  canMove: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen?: (task: Task) => void;
}

function CardInner({
  task,
  getAssigneeName,
  projectName,
  canMove,
  selectable,
  selected,
  onToggleSelect,
}: CardInnerProps) {
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
        <div className="flex items-center gap-1">
          {selectable && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(task.id);
              }}
              aria-label={selected ? "Deselect task" : "Select task"}
              className={cn(
                "flex size-4 items-center justify-center rounded border transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-transparent hover:border-primary/60",
              )}
            >
              <Check className="size-3" />
            </button>
          )}
          {canMove && (
            <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </div>
      <p className="mt-2 line-clamp-2 font-medium text-foreground">{task.title}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <TaskPriorityBadge priority={task.priority} />
        <DueDate dueDate={task.dueDate} status={task.status} />
      </div>
      {task.version && (
        <span className="mt-2 inline-flex w-fit rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          v{task.version}
        </span>
      )}
      <div className="mt-2.5 flex items-center gap-2 border-t border-border/60 pt-2.5">
        <AssigneeDisplay
          assignment={task.assignment}
          getName={getAssigneeName}
        />
      </div>
    </>
  );
}

const cardClasses =
  "relative overflow-hidden rounded-lg border border-border bg-card p-3 pl-3.5 text-sm shadow-sm before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']";

/** Static card used by the drag overlay (no sortable registration). */
export function KanbanCardView(props: CardInnerProps) {
  return (
    <div className={cn(cardClasses, PRIORITY_STRIPE[props.task.priority], "rotate-2 shadow-lg")}>
      <CardInner {...props} />
    </div>
  );
}

/** Draggable card registered with dnd-kit sortable. */
export function KanbanCard(props: CardInnerProps) {
  const { task, canMove, selected, onOpen } = props;
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
      onClick={() => onOpen?.(task)}
      className={cn(
        cardClasses,
        PRIORITY_STRIPE[task.priority],
        "transition-shadow hover:shadow-md",
        canMove && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        selected && "ring-2 ring-primary",
      )}
      {...(canMove ? attributes : {})}
      {...(canMove ? listeners : {})}
    >
      <CardInner {...props} />
    </div>
  );
}
