import { Building2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { AssigneeAvatar } from "../kanban/KanbanCard";
import type { TaskAssignment } from "../../types/task";

interface AssigneeDisplayProps {
  /** Pass either a full task or just its assignment. */
  assignment: TaskAssignment;
  getName: (id: string) => string;
  /** Compact variant hides the trailing name label for INDIVIDUAL. */
  compact?: boolean;
  className?: string;
}

/**
 * Renders a task assignment:
 * - INDIVIDUAL: avatar + name.
 * - MULTIPLE: stacked avatars (up to 3) + "+N", title lists all names.
 * - DEPARTMENT: a department badge ("HR · {count}").
 */
export function AssigneeDisplay({
  assignment,
  getName,
  compact,
  className,
}: AssigneeDisplayProps) {
  if (assignment.type === "DEPARTMENT") {
    const count = assignment.userIds.length;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
        title={`${assignment.department ?? "Department"} · ${count} member${count === 1 ? "" : "s"}`}
      >
        <Building2 className="size-3.5 shrink-0" />
        <span className="truncate">
          {assignment.department ?? "Department"} · {count}
        </span>
      </span>
    );
  }

  const names = assignment.userIds.map(getName);

  if (assignment.type === "MULTIPLE") {
    const shown = assignment.userIds.slice(0, 3);
    const extra = assignment.userIds.length - shown.length;
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        title={names.join(", ")}
      >
        <span className="flex -space-x-1.5">
          {shown.map((id, i) => (
            <AssigneeAvatar
              key={id}
              name={names[i] ?? "Unknown"}
              className="ring-2 ring-card"
            />
          ))}
          {extra > 0 && (
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card">
              +{extra}
            </span>
          )}
        </span>
        {!compact && (
          <span className="truncate text-xs text-muted-foreground">
            {assignment.userIds.length} assignees
          </span>
        )}
      </span>
    );
  }

  // INDIVIDUAL
  const name = names[0] ?? "Unknown";
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <AssigneeAvatar name={name} />
      {!compact && (
        <span className="truncate text-xs text-muted-foreground">{name}</span>
      )}
    </span>
  );
}

/** Join assignment into a searchable / plain-text label. */
export function assignmentLabel(
  assignment: TaskAssignment,
  getName: (id: string) => string,
): string {
  if (assignment.type === "DEPARTMENT") {
    return `${assignment.department ?? "Department"} (${assignment.userIds.length})`;
  }
  return assignment.userIds.map(getName).join(", ");
}
