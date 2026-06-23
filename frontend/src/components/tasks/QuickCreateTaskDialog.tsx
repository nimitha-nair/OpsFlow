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
import { apiErrorMessage, createTask } from "../../lib/tasks-api";
import { listProjects } from "../../lib/projects-api";
import { listProjectMembers } from "../../lib/project-members-api";
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

interface Member {
  id: string;
  name: string;
}

const EMPTY = {
  title: "",
  description: "",
  assigneeId: "",
  priority: "MEDIUM" as TaskPriority,
  status: "TODO" as TaskStatus,
  dueDate: "",
  version: "",
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
  const [projects, setProjects] = useState<Member[]>([]);
  const [projectId, setProjectId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [values, setValues] = useState(EMPTY);
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

  // Load eligible assignees whenever the chosen project changes.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void (async () => {
      setLoadingMembers(true);
      try {
        const ms = await listProjectMembers(projectId);
        if (!cancelled) {
          setMembers(ms.map((m) => ({ id: m.userId, name: m.user?.name ?? "Unknown" })));
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
  }, [projectId]);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit =
    projectId !== "" &&
    values.title.trim() !== "" &&
    values.assigneeId !== "" &&
    values.dueDate !== "";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createTask({ projectId, ...values });
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
              Pick a project, then assign it to one of its members.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-project">Project</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v ?? "");
                  set("assigneeId", "");
                }}
              >
                <SelectTrigger id="qc-project" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No projects available
                    </SelectItem>
                  ) : (
                    projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="qc-assignee">Assignee</Label>
              <Select
                value={values.assigneeId}
                onValueChange={(v) => set("assigneeId", v ?? "")}
                disabled={!projectId || loadingMembers}
              >
                <SelectTrigger id="qc-assignee" className="w-full">
                  <SelectValue
                    placeholder={
                      !projectId
                        ? "Select a project first"
                        : loadingMembers
                          ? "Loading members…"
                          : "Select a team member"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {members.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No members on this project
                    </SelectItem>
                  ) : (
                    members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

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
