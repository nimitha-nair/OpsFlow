import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "../../types/task";
import { STATUS_STYLES } from "./task-status-styles";

/**
 * The forward workflow: clicking the chip's quick-action advances one step.
 * ON_HOLD rejoins the flow at IN_PROGRESS; DONE has no next step.
 */
const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  TODO: "IN_PROGRESS",
  IN_PROGRESS: "REVIEW",
  ON_HOLD: "IN_PROGRESS",
  REVIEW: "DONE",
};

interface TaskStatusControlProps {
  status: TaskStatus;
  onChange: (status: TaskStatus, reason?: string) => void;
  busy?: boolean;
  /** Statuses the current user may move TO. Defaults to all. */
  allowed?: readonly TaskStatus[];
  /** Statuses that require a reason before applying (e.g. ON_HOLD). */
  reasonRequired?: readonly TaskStatus[];
}

/**
 * Chip-based status control: the current status shows as a colored chip, a
 * one-click "advance" button moves it to the next allowed step, and the chip
 * opens a picker. Statuses outside `allowed` are shown but disabled, and a
 * `reasonRequired` status prompts for a reason first.
 */
export function TaskStatusControl({
  status,
  onChange,
  busy,
  allowed = TASK_STATUSES,
  reasonRequired = [],
}: TaskStatusControlProps) {
  const [reasonFor, setReasonFor] = useState<TaskStatus | null>(null);
  const [reason, setReason] = useState("");

  const canMoveTo = (s: TaskStatus) => s !== status && allowed.includes(s);
  const next = NEXT_STATUS[status];
  const showAdvance = next && allowed.includes(next);

  function choose(s: TaskStatus) {
    if (!canMoveTo(s)) return;
    if (reasonRequired.includes(s)) {
      setReason("");
      setReasonFor(s);
      return;
    }
    onChange(s);
  }

  function submitReason() {
    if (reasonFor && reason.trim()) {
      onChange(reasonFor, reason.trim());
      setReasonFor(null);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy || allowed.length === 0}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            STATUS_STYLES[status],
          )}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
          {TASK_STATUS_LABELS[status]}
          <ChevronDown className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {/* Only the statuses this user may move to — so employees never see
              To Do or Done, while admins (allowed = all) see everything. */}
          {TASK_STATUSES.filter((s) => allowed.includes(s)).map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => choose(s)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block size-2 rounded-full",
                    STATUS_STYLES[s],
                  )}
                />
                {TASK_STATUS_LABELS[s]}
              </span>
              {s === status && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {showAdvance && next && (
        <button
          type="button"
          disabled={busy}
          onClick={() => choose(next)}
          title={`Move to ${TASK_STATUS_LABELS[next]}`}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
        >
          → {TASK_STATUS_LABELS[next]}
        </button>
      )}

      <Dialog open={reasonFor !== null} onOpenChange={(o) => !o && setReasonFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Put task {reasonFor ? `on ${TASK_STATUS_LABELS[reasonFor]}` : "on hold"}
            </DialogTitle>
            <DialogDescription>
              Add a short reason so the team knows why this task is paused.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="hold-reason">Reason</Label>
            <Textarea
              id="hold-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Blocked on design approval"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitReason} disabled={reason.trim() === ""}>
              Put on hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
