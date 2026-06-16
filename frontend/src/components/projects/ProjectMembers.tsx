import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { formatDate } from "../../lib/format";
import {
  apiErrorMessage,
  assignProjectMember,
  listProjectMembers,
  removeProjectMember,
} from "../../lib/project-members-api";
import { listUsers } from "../../lib/users-api";
import type { ProjectMember } from "../../types/projectMember";
import type { User } from "../../types/user";

interface ProjectMembersProps {
  projectId: string;
  /** When true, hides assign/remove controls (HR & Employee view). */
  readOnly?: boolean;
  /** Bump to force a refetch (coordinated refresh across project sections). */
  refreshKey?: number;
  /** Called after a successful mutation so sibling sections can refetch too. */
  onMutated?: () => void;
}

export function ProjectMembers({
  projectId,
  readOnly,
  refreshKey,
  onMutated,
}: ProjectMembersProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await listProjectMembers(projectId);
        if (!cancelled) setMembers(data);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Failed to load team members."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey, refreshKey]);

  const reload = () => setReloadKey((k) => k + 1);
  // After a mutation: notify the parent (coordinated refresh) or refetch locally.
  const notify = () => (onMutated ? onMutated() : reload());

  // Employees eligible to add = EMPLOYEE role, not already assigned.
  const memberIds = useMemo(
    () => new Set(members.map((m) => m.userId)),
    [members],
  );
  const availableEmployees = useMemo(
    () => employees.filter((e) => !memberIds.has(e.id)),
    [employees, memberIds],
  );

  async function openAssignDialog() {
    setSelectedUserId("");
    setDialogOpen(true);
    setLoadingEmployees(true);
    setEmployeesError(null);
    try {
      const res = await listUsers({ role: "EMPLOYEE", limit: 100 });
      setEmployees(res.data);
    } catch (err) {
      setEmployeesError(apiErrorMessage(err, "Failed to load employees."));
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function handleAssign() {
    if (!selectedUserId) return;
    setAssigning(true);
    try {
      await assignProjectMember(projectId, selectedUserId);
      toast.success("Employee assigned to project.");
      setDialogOpen(false);
      notify();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to assign employee."));
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(userId: string, name: string) {
    setRemovingId(userId);
    try {
      await removeProjectMember(projectId, userId);
      toast.success(`${name} removed from project.`);
      notify();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to remove employee."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">
          Team Members
          {!loading && !error && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({members.length})
            </span>
          )}
        </CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={openAssignDialog}>
            <UserPlus className="size-4" />
            Assign Employee
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <LoadingState compact label="Loading team…" />
        ) : error ? (
          <ErrorState
            title="Couldn't load team members"
            description={error}
            onRetry={reload}
          />
        ) : members.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No team members yet"
            description="Assign employees to build this project's team."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned</TableHead>
                  {!readOnly && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">
                          {member.user?.name ?? "Unknown user"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {member.user?.position
                            ? `${member.user.position} · `
                            : ""}
                          {member.user?.email ?? member.userId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {member.user?.role ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(member.assignedAt)}
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={removingId === member.userId}
                          onClick={() =>
                            handleRemove(
                              member.userId,
                              member.user?.name ?? "Employee",
                            )
                          }
                        >
                          {removingId === member.userId ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          Remove
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {!readOnly && (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Employee</DialogTitle>
            <DialogDescription>
              Only employees can be assigned. Those already on the team are
              hidden.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {loadingEmployees ? (
              <LoadingState compact label="Loading employees…" />
            ) : employeesError ? (
              <p className="text-sm text-destructive">{employeesError}</p>
            ) : availableEmployees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No employees are available to assign.
              </p>
            ) : (
              <Select
                value={selectedUserId}
                onValueChange={(v) => setSelectedUserId(v ?? "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} — {employee.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={assigning}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedUserId || assigning}
            >
              {assigning && <Loader2 className="size-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      )}
    </Card>
  );
}
