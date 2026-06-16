import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FolderOpen, RefreshCw } from "lucide-react";

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
import { EmptyState } from "../common/EmptyState";
import { ErrorState } from "../common/ErrorState";
import { LoadingState } from "../common/LoadingState";
import { PageHeader } from "../layout/PageHeader";
import type { Crumb } from "../layout/PageHeader";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { formatDate } from "../../lib/format";
import {
  apiErrorMessage,
  listMyProjects,
  listProjects,
} from "../../lib/projects-api";
import type { Project } from "../../types/project";

interface ProjectsVisibilityListProps {
  title: string;
  description: string;
  breadcrumbs: Crumb[];
  /** Path prefix for project links, e.g. "/hr/projects". */
  basePath: string;
  /** "all" = GET /projects (HR); "mine" = GET /projects/my-projects (Employee). */
  source: "all" | "mine";
  emptyTitle: string;
  emptyDescription: string;
}

export function ProjectsVisibilityList({
  title,
  description,
  breadcrumbs,
  basePath,
  source,
  emptyTitle,
  emptyDescription,
}: ProjectsVisibilityListProps) {
  const [projects, setProjects] = useState<Project[]>([]);
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
        const data =
          source === "mine"
            ? await listMyProjects()
            : (await listProjects({ limit: 100 })).data;
        if (!cancelled) setProjects(data);
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
  }, [source, reloadKey]);

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
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
      />

      <div className="mb-4 flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or client…"
          className="max-w-xs"
        />
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
              title={projects.length === 0 ? emptyTitle : "No matching projects"}
              description={
                projects.length === 0
                  ? emptyDescription
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
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Timeline</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium text-foreground">
                      {project.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {project.clientName}
                    </TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(project.startDate)} –{" "}
                      {formatDate(project.endDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        to={`${basePath}/${project.id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        <Eye className="size-4" />
                        View
                      </Link>
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
