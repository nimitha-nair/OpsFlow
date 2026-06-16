import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { PageHeader } from "../components/layout/PageHeader";
import { apiErrorMessage, listUsers } from "../lib/users-api";
import type { User } from "../types/user";

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

export function EmployeesPage() {
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listUsers({ role: "EMPLOYEE", limit: 100 });
        if (!cancelled) setEmployees(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Failed to load employees."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="All employees in the organization."
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Employees" }]}
      />

      <div className="mb-4 flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-xs"
        />
        <Button variant="outline" size="icon" onClick={reload} aria-label="Refresh">
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load employees"
              description={error}
              onRetry={reload}
            />
          </div>
        ) : loading ? (
          <LoadingState label="Loading employees…" />
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Users}
              title={employees.length === 0 ? "No employees yet" : "No matches"}
              description={
                employees.length === 0
                  ? "Employees will appear here once they are created."
                  : "Try a different search term."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium text-foreground">
                      {emp.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.position || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.department || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={emp.isActive} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </>
  );
}
