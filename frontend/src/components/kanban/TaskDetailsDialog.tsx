import { Pencil, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge, TaskStatusBadge } from "../tasks/TaskBadges";
import { TaskComments } from "../tasks/TaskComments";
import { TaskAttachments } from "../tasks/TaskAttachments";
import { AssigneeDisplay } from "../tasks/AssigneeDisplay";
import type { Task } from "../../types/task";

interface TaskDetailsDialogProps {
  task: Task | null;
  projectName: string;
  /** id → display name resolver for assignment rendering. */
  getAssigneeName: (id: string) => string;
  onOpenChange: (open: boolean) => void;
  /** Admin-only actions. When omitted, the dialog is read-only. */
  canManage?: boolean;
  onEdit?: (task: Task) => void;
  onReopen?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function TaskDetailsDialog({
  task,
  projectName,
  getAssigneeName,
  onOpenChange,
  canManage,
  onEdit,
  onReopen,
  onDelete,
}: TaskDetailsDialogProps) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription>
                {task.code && (
                  <span className="font-mono text-xs">{task.code}</span>
                )}
                {task.code ? " · " : ""}
                {projectName}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <Row
                label={
                  task.assignment.type === "DEPARTMENT"
                    ? "Department"
                    : task.assignment.type === "MULTIPLE"
                      ? "Assignees"
                      : "Assignee"
                }
              >
                {task.assignment.type === "MULTIPLE" ? (
                  <span className="flex flex-wrap gap-x-1.5">
                    {task.assignment.userIds
                      .map((id) => getAssigneeName(id))
                      .join(", ")}
                  </span>
                ) : (
                  <AssigneeDisplay
                    assignment={task.assignment}
                    getName={getAssigneeName}
                  />
                )}
              </Row>
              <Row label="Due date">
                <DueDate dueDate={task.dueDate} status={task.status} />
              </Row>
              <Row label="Priority">
                <TaskPriorityBadge priority={task.priority} />
              </Row>
              <Row label="Status">
                <TaskStatusBadge status={task.status} />
              </Row>
              {task.version && <Row label="Version">{task.version}</Row>}
            </dl>

            {task.description && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Description
                </span>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {task.description}
                </p>
              </div>
            )}

            <div className="border-t border-border/60 pt-3">
              <TaskAttachments taskId={task.id} />
            </div>

            <div className="border-t border-border/60 pt-3">
              <TaskComments taskId={task.id} projectId={task.projectId} />
            </div>

            {canManage && (onEdit || onReopen || onDelete) && (
              <DialogFooter className="mt-2 sm:justify-between">
                <div>
                  {onDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => onDelete(task)}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {onReopen && task.status === "DONE" && (
                    <Button variant="outline" size="sm" onClick={() => onReopen(task)}>
                      <RotateCcw className="size-4" />
                      Reopen
                    </Button>
                  )}
                  {onEdit && (
                    <Button size="sm" onClick={() => onEdit(task)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  )}
                </div>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
