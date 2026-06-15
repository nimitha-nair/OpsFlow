import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, RefreshCw, TriangleAlert, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "../../components/common/EmptyState";
import { PageHeader } from "../../components/layout/PageHeader";
import { apiErrorMessage, listUsers } from "../../lib/users-api";
import type { User } from "../../types/user";

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-400">
      Active
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

export function UserListPage() {
  const [users, setUsers] = useState<User[]>([]);
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
        const res = await listUsers({ limit: 100 });
        if (!cancelled) setUsers(res.data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Failed to load users."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  return (
    <>
      <PageHeader
        title="User Management"
        description="Create, view, and manage organization accounts."
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "User Management" },
        ]}
        actions={
          <Link to="/admin/users/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-4" />
            New User
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-xs"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => setReloadKey((k) => k + 1)}
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {error ? (
          <div className="p-6">
            <EmptyState
              icon={TriangleAlert}
              title="Couldn't load users"
              description={error}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <div className="p-6">
                      <EmptyState
                        icon={Users}
                        title={
                          users.length === 0
                            ? "No users yet"
                            : "No matching users"
                        }
                        description={
                          users.length === 0
                            ? "Create the first user to get started."
                            : "Try a different search term."
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-foreground">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.department || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={user.isActive} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`/admin/users/${user.id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
