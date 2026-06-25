import { useEffect, useState } from "react";
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
  isAssignmentValid,
  type AssignmentDraft,
  type MemberOption,
} from "./AssignmentField";
import { apiErrorMessage, createTask } from "../../lib/tasks-api";
import { listProjects } from "../../lib/projects-api";
import { listProjectMembers } from "../../lib/project-members-api";
import { listUsers } from "../../lib/users-api";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "../../types/task";

interface QuickCreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a task is created so the caller can refresh. */
  onCreated?: () => void;
}

interface NamedProject {
  id: string;
  name: string;
}

const EMPTY = {
  title: "",
  description: "",
  priority: "MEDIUM" as TaskPriority,
  status: "TODO" as TaskStatus,
  dueDate: "",
  version: "",
};

const EMPTY_ASSIGNMENT: AssignmentDraft = {
  type: "INDIVIDUAL",
  userIds: [],
  department: "",
};

/**
 * Globally-accessible "New Task" quick-create. Unlike the project-scoped
 * TaskFormDialog, it starts with a project picker that drives the eligible
 * assignees (project members). Task creation is ADMIN-only on the backend.
 */
export function QuickCreateTaskDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickCreateTaskDialogProps) {
  const [projects, setProjects] = useState<NamedProject[]>([]);
  const [projectId, setProjectId] = useState("");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [values, setValues] = useState(EMPTY);
  const [assignment, setAssignment] = useState<AssignmentDraft>(EMPTY_ASSIGNMENT);
  const [submitting, setSubmitting] = useState(false);

  // Load the project list when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      // Start each open from a clean slate.
      setProjectId("");
      setMembers([]);
      setValues(EMPTY);
      setAssignment(EMPTY_ASSIGNMENT);
      try {
        const r = await listProjects({ limit: 100 });
        if (!cancelled) setProjects(r.data.map((p) => ({ id: p.id, name: p.name })));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Load eligible assignees: project members when a project is chosen, else
  // (General) all active users — so company-wide / department tasks (e.g. HR)
  // can be assigned even though those users aren't on any project.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoadingMembers(true);
      try {
        if (projectId) {
          const ms = await listProjectMembers(projectId);
          if (!cancelled) {
            setMembers(
              ms.map((m) => ({
                id: m.userId,
                name: m.user?.name ?? "Unknown",
                department: m.user?.department,
              })),
            );
          }
        } else {
          const us = await listUsers({ limit: 1000 });
          if (!cancelled) {
            setMembers(
              us.data
                .filter((u) => u.isActive !== false)
                .map((u) => ({
                  id: u.id,
                  name: u.name,
                  department: u.department,
                })),
            );
          }
        }
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
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
      await createTask({
        ...(projectId ? { projectId } : {}),
        ...values,
        assignment: assignmentInput,
      });
      toast.success("Task created.");
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create task."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>
              Assign to a project member, or leave the project as{" "}
              <strong>General</strong> for a company-wide or department task
              (e.g. HR).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-project">
                Project{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Select
                value={projectId === "" ? "__general" : projectId}
                onValueChange={(v) => {
                  setProjectId(v === "__general" ? "" : (v ?? ""));
                  setAssignment(EMPTY_ASSIGNMENT);
                }}
              >
                <SelectTrigger id="qc-project" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__general">
                    General
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-title">Title</Label>
              <Input
                id="qc-title"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-description">
                Description{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="qc-description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
              />
            </div>

            <AssignmentField
              value={assignment}
              onChange={setAssignment}
              members={members}
              disabled={loadingMembers}
              placeholder={
                loadingMembers ? "Loading people…" : "Select a team member"
              }
              idPrefix="qc"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="qc-priority">Priority</Label>
                <Select
                  value={values.priority}
                  onValueChange={(v) => set("priority", (v ?? "MEDIUM") as TaskPriority)}
                >
                  <SelectTrigger id="qc-priority" className="w-full">
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
                <Label htmlFor="qc-status">Status</Label>
                <Select
                  value={values.status}
                  onValueChange={(v) => set("status", (v ?? "TODO") as TaskStatus)}
                >
                  <SelectTrigger id="qc-status" className="w-full">
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
                <Label htmlFor="qc-due">Due date</Label>
                <Input
                  id="qc-due"
                  type="date"
                  value={values.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-version">
                Version{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="qc-version"
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
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
