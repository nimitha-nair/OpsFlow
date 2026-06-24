import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FolderOpen, Pencil, Plus, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { ActiveRangeBadge } from "../../components/common/ActiveRangeBadge";
import { DateRangeFilter } from "../../components/common/DateRangeFilter";
import { EmptyState } from "../../components/common/EmptyState";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ProjectStatusBadge } from "../../components/projects/ProjectStatusBadge";
import { makeRange, rangeToParams, type DateRange } from "../../lib/date-range";
import { formatCurrency, formatDate } from "../../lib/format";
import { apiErrorMessage, listProjects } from "../../lib/projects-api";
import type { Project } from "../../types/project";

export function ProjectListPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [range, setRange] = useState<DateRange>(() => makeRange("all"));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await listProjects({ limit: 100, ...rangeToParams(range) });
        if (!cancelled) setProjects(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Failed to load projects."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q),
    );
  }, [projects, search]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Manage client projects across the organization."
        breadcrumbs={[{ label: "Admin", to: "/admin" }, { label: "Projects" }]}
        actions={
          <Link
            to="/admin/projects/new"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="size-4" />
            New Project
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or client…"
          className="max-w-xs"
        />
        <DateRangeFilter value={range} onChange={setRange} />
        <ActiveRangeBadge range={range} />
        <Button
          variant="outline"
          size="icon"
          onClick={reload}
          aria-label="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {error ? (
          <div className="p-6">
            <ErrorState
              title="Couldn't load projects"
              description={error}
              onRetry={reload}
            />
          </div>
        ) : loading ? (
          <LoadingState label="Loading projects…" />
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={FolderOpen}
              title={
                projects.length === 0
                  ? "No projects yet"
                  : "No matching projects"
              }
              description={
                projects.length === 0
                  ? "Create the first project to get started."
                  : "Try a different search term."
              }
              action={
                projects.length === 0 ? (
                  <Link
                    to="/admin/projects/new"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <Plus className="size-4" />
                    New Project
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                      {project.code ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {project.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.clientName}
                    </TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatCurrency(project.budget)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(project.startDate)} –{" "}
                      {formatDate(project.endDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          to={`/admin/projects/${project.id}`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          <Eye className="size-4" />
                          View
                        </Link>
                        <Link
                          to={`/admin/projects/${project.id}/edit`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Link>
                      </div>
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
