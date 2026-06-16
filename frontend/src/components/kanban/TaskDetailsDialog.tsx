import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge, TaskStatusBadge } from "../tasks/TaskBadges";
import type { Task } from "../../types/task";

interface TaskDetailsDialogProps {
  task: Task | null;
  projectName: string;
  assigneeName: string;
  onOpenChange: (open: boolean) => void;
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
  assigneeName,
  onOpenChange,
}: TaskDetailsDialogProps) {
  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription>{projectName}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-4 py-2">
              <Row label="Assignee">{assigneeName}</Row>
              <Row label="Due date">
                <DueDate dueDate={task.dueDate} status={task.status} />
              </Row>
              <Row label="Priority">
                <TaskPriorityBadge priority={task.priority} />
              </Row>
              <Row label="Status">
                <TaskStatusBadge status={task.status} />
              </Row>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
