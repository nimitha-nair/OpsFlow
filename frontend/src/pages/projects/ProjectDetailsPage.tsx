import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, Loader2, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ProjectMembers } from "../../components/projects/ProjectMembers";
import { ProjectStatusBadge } from "../../components/projects/ProjectStatusBadge";
import { ProjectTasks } from "../../components/projects/ProjectTasks";
import { formatCurrency, formatDate } from "../../lib/format";
import {
  apiErrorMessage,
  archiveProject,
  getProject,
  unarchiveProject,
} from "../../lib/projects-api";
import { PROJECT_STATUS_LABELS } from "../../types/project";
import type { Project } from "../../types/project";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [archiving, setArchiving] = useState(false);
  // Shared version so Members, Tasks, and the Kanban board all refetch together
  // when any of them mutates data.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = () => setDataVersion((v) => v + 1);

  async function handleArchiveToggle() {
    if (!project) return;
    setArchiving(true);
    try {
      const updated = project.archived
        ? await unarchiveProject(project.id)
        : await archiveProject(project.id);
      setProject(updated);
      toast.success(updated.archived ? "Project archived." : "Project restored.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update the project."));
    } finally {
      setArchiving(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    const projectId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await getProject(projectId);
        if (!cancelled) setProject(data);
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Project not found."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  return (
    <>
      <PageHeader
        title={project ? project.name : "Project"}
        description={project?.code}
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Projects", to: "/admin/projects" },
          { label: project?.code ?? (project ? project.name : "Details") },
        ]}
        actions={
          project && (
            <div className="flex gap-2">
              {!project.archived && (
                <Link
                  to={`/admin/projects/${project.id}/edit`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Pencil className="size-4" />
                  Edit
                </Link>
              )}
              <Button
                size="sm"
                variant={project.archived ? "default" : "outline"}
                onClick={handleArchiveToggle}
                disabled={archiving}
              >
                {archiving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : project.archived ? (
                  <ArchiveRestore className="size-4" />
                ) : (
                  <Archive className="size-4" />
                )}
                {project.archived ? "Restore" : "Archive"}
              </Button>
            </div>
          )
        }
      />

      {loading ? (
        <LoadingState label="Loading project…" />
      ) : error || !project ? (
        <ErrorState
          title="Couldn't load project"
          description={error ?? "This project could not be found."}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {project.archived && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                This project is <strong>archived</strong> and read-only. New
                tasks, expenses, and team changes are disabled. Restore it to
                make changes. Historical data remains visible.
              </span>
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Overview</CardTitle>
              <div className="flex items-center gap-2">
                {project.archived && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Archived
                  </Badge>
                )}
                <ProjectStatusBadge status={project.status} />
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Client" value={project.clientName} />
                <Field label="Budget" value={formatCurrency(project.budget)} />
                <Field
                  label="Status"
                  value={PROJECT_STATUS_LABELS[project.status]}
                />
                <Field
                  label="Start date"
                  value={formatDate(project.startDate)}
                />
                <Field label="End date" value={formatDate(project.endDate)} />
                <Field
                  label="Created by"
                  value={project.createdByName || "Unknown"}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {project.description || "No description provided."}
              </p>
            </CardContent>
          </Card>

          <ProjectMembers
            projectId={project.id}
            readOnly={project.archived}
            refreshKey={dataVersion}
            onMutated={bumpData}
          />
          <ProjectTasks
            projectId={project.id}
            readOnly={project.archived}
            refreshKey={dataVersion}
            onMutated={bumpData}
          />
        </div>
      )}
    </>
  );
}
