import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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
import { apiErrorMessage, getProject } from "../../lib/projects-api";
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
  // Shared version so Members, Tasks, and the Kanban board all refetch together
  // when any of them mutates data.
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = () => setDataVersion((v) => v + 1);

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
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Projects", to: "/admin/projects" },
          { label: project ? project.name : "Details" },
        ]}
        actions={
          project && (
            <Link
              to={`/admin/projects/${project.id}/edit`}
              className={buttonVariants({ size: "sm" })}
            >
              <Pencil className="size-4" />
              Edit
            </Link>
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
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Overview</CardTitle>
              <ProjectStatusBadge status={project.status} />
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
                <Field label="Created by" value={project.createdBy} />
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
            refreshKey={dataVersion}
            onMutated={bumpData}
          />
          <ProjectTasks
            projectId={project.id}
            refreshKey={dataVersion}
            onMutated={bumpData}
          />
        </div>
      )}
    </>
  );
}
