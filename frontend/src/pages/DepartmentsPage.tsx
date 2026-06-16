import { useEffect, useMemo, useState } from "react";
import { Building2, TrendingUp, Users } from "lucide-react";

import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "../components/common/EmptyState";
import { ErrorState } from "../components/common/ErrorState";
import { LoadingState } from "../components/common/LoadingState";
import { StatCard } from "../components/dashboard/StatCard";
import { PageHeader } from "../components/layout/PageHeader";
import { apiErrorMessage, listUsers } from "../lib/users-api";
import type { User } from "../types/user";

interface DeptRow {
  name: string;
  total: number;
  active: number;
}

export function DepartmentsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listUsers({ limit: 100 });
        if (!cancelled) setUsers(res.data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load data."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const rows = useMemo<DeptRow[]>(() => {
    const map = new Map<string, DeptRow>();
    for (const u of users) {
      const name = u.department?.trim() || "No department";
      const cur = map.get(name) ?? { name, total: 0, active: 0 };
      cur.total += 1;
      if (u.isActive) cur.active += 1;
      map.set(name, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [users]);

  const namedDepartments = rows.filter((r) => r.name !== "No department");
  const largest = rows[0]?.name ?? "—";
  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <>
      <PageHeader
        title="Departments"
        description="Department statistics derived from user records."
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Departments" }]}
      />

      {loading ? (
        <LoadingState label="Loading departments…" />
      ) : error ? (
        <ErrorState
          title="Couldn't load departments"
          description={error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : users.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={Building2}
            title="No users yet"
            description="Department statistics will appear once users exist."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Departments"
              value={namedDepartments.length}
              icon={Building2}
            />
            <StatCard label="Total Users" value={users.length} icon={Users} />
            <StatCard label="Largest" value={largest} icon={TrendingUp} />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Headcount</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-1/3">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium text-foreground">
                        {row.name}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.total}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.active}
                      </TableCell>
                      <TableCell>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${(row.total / maxTotal) * 100}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
