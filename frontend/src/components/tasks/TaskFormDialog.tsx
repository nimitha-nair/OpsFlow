import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AssignmentField,
  assignmentInputFromDraft,
  draftFromAssignment,
  isAssignmentValid,
  type AssignmentDraft,
} from "./AssignmentField";
import {
  apiErrorMessage,
  createTask,
  updateTask,
} from "../../lib/tasks-api";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "../../types/task";

export interface AssigneeOption {
  id: string;
  name: string;
  /** Member's department, used for DEPARTMENT assignment. */
  department?: string;
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  projectId: string;
  /** Eligible assignees = current project members. */
  members: AssigneeOption[];
  task?: Task;
  onSaved: () => void;
}

interface FormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version: string;
}

function TaskFormBody({
  mode,
  projectId,
  members,
  task,
  onOpenChange,
  onSaved,
}: Omit<TaskFormDialogProps, "open">) {
  const [values, setValues] = useState<FormValues>(() =>
    task
      ? {
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
          version: task.version ?? "",
        }
      : {
          title: "",
          description: "",
          priority: "MEDIUM",
          status: "TODO",
          dueDate: "",
          version: "",
        },
  );
  const [assignment, setAssignment] = useState<AssignmentDraft>(() =>
    draftFromAssignment(task?.assignment),
  );
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    values.title.trim() !== "" &&
    isAssignmentValid(assignment) &&
    values.dueDate !== "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const assignmentInput = assignmentInputFromDraft(assignment);
    if (!canSubmit || !assignmentInput) return;
    setSubmitting(true);
    try {
      if (mode === "create") {
        await createTask({ projectId, ...values, assignment: assignmentInput });
        toast.success("Task created.");
      } else if (task) {
        await updateTask(task.id, { ...values, assignment: assignmentInput });
        toast.success("Task updated.");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save task."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>
          {mode === "create" ? "New Task" : "Edit Task"}
        </DialogTitle>
        <DialogDescription>
          Assignees must already be members of this project.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-title">Title</Label>
          <Input
            id="task-title"
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="task-description">
            Description{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="task-description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
          />
        </div>

        <AssignmentField
          value={assignment}
          onChange={setAssignment}
          members={members}
          idPrefix="task"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-priority">Priority</Label>
            <Select
              value={values.priority}
              onValueChange={(v) =>
                set("priority", (v ?? "MEDIUM") as TaskPriority)
              }
            >
              <SelectTrigger id="task-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(v) => set("status", (v ?? "TODO") as TaskStatus)}
            >
              <SelectTrigger id="task-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input
              id="task-due"
              type="date"
              value={values.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="task-version">
            Version{" "}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="task-version"
            value={values.version}
            onChange={(e) => set("version", e.target.value)}
            placeholder="e.g. 1.2.0 or Sprint 5"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {mode === "create" ? "Create Task" : "Save Changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function TaskFormDialog({ open, ...rest }: TaskFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={rest.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <TaskFormBody {...rest} />}
      </DialogContent>
    </Dialog>
  );
}
