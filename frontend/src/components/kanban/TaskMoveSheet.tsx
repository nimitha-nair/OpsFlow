import { useState } from "react";
import { Check, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DueDate } from "../tasks/DueDate";
import { TaskPriorityBadge } from "../tasks/TaskBadges";
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

interface TaskMoveSheetProps {
  /** Open when non-null. */
  task: Task | null;
  getProjectName: (id?: string) => string;
  /** Statuses the user may move TO (defaults to all). */
  allowed?: readonly TaskStatus[];
  /** Statuses that need a reason first (e.g. ON_HOLD). */
  reasonRequired?: readonly TaskStatus[];
  onMove: (taskId: string, status: TaskStatus, reason?: string) => void;
  onOpenDetails: (task: Task) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mobile-native "move task" bottom sheet. Replaces desktop drag-and-drop: tap a
 * card, then tap a large status row to move it (a reason is requested inline for
 * statuses like On Hold). A "Full details" action opens the details dialog.
 */
export function TaskMoveSheet({
  task,
  getProjectName,
  allowed = TASK_STATUSES,
  reasonRequired = [],
  onMove,
  onOpenDetails,
  onOpenChange,
}: TaskMoveSheetProps) {
  const [reasonFor, setReasonFor] = useState<TaskStatus | null>(null);
  const [reason, setReason] = useState("");

  function close() {
    setReasonFor(null);
    setReason("");
    onOpenChange(false);
  }

  function choose(s: TaskStatus) {
    if (!task || s === task.status || !allowed.includes(s)) return;
    if (reasonRequired.includes(s)) {
      setReason("");
      setReasonFor(s);
      return;
    }
    onMove(task.id, s);
    close();
  }

  function confirmReason() {
    if (task && reasonFor && reason.trim()) {
      onMove(task.id, reasonFor, reason.trim());
      close();
    }
  }

  return (
    <Sheet
      open={task !== null}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      {task && (
        <SheetContent className="md:hidden">
          <SheetHeader>
            <SheetTitle className="truncate">{task.title}</SheetTitle>
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {task.code && <span className="font-mono">{task.code}</span>}
              <span>{getProjectName(task.projectId)}</span>
              <TaskPriorityBadge priority={task.priority} />
              <DueDate dueDate={task.dueDate} status={task.status} />
            </div>

            {reasonFor ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="move-reason">
                  Reason for {TASK_STATUS_LABELS[reasonFor]}
                </Label>
                <Textarea
                  id="move-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Blocked on design approval"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setReasonFor(null)}
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={confirmReason}
                    disabled={reason.trim() === ""}
                  >
                    Confirm move
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Move to
                </span>
                {TASK_STATUSES.map((s) => {
                  const isCurrent = s === task.status;
                  const disabled = isCurrent || !allowed.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={disabled}
                      onClick={() => choose(s)}
                      aria-current={isCurrent}
                      className={cn(
                        "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 text-left transition-colors",
                        isCurrent
                          ? "border-primary/40 bg-primary/5"
                          : disabled
                            ? "border-border/50 opacity-45"
                            : "border-border active:bg-muted/60",
                      )}
                    >
                      <span className="flex items-center gap-2.5 text-sm font-medium text-foreground">
                        <span
                          className={cn(
                            "inline-block size-2.5 rounded-full",
                            STATUS_DOT[s],
                          )}
                        />
                        {TASK_STATUS_LABELS[s]}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary">
                          <Check className="size-4" /> Current
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const t = task;
                close();
                onOpenDetails(t);
              }}
            >
              <FileText className="size-4" />
              Full details
            </Button>
          </SheetBody>
        </SheetContent>
      )}
    </Sheet>
  );
}
