import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

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
import { useAuth } from "../../context/auth-context";
import { formatDate } from "../../lib/format";
import { roleBasePath } from "../../lib/navigation";
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

/** Elapsed share of the project's timeline (0–100), clamped. */
function timelineProgress(startDate: string, endDate: string): number {
  const start = Date.parse(startDate);
  const end = Date.parse(endDate);
  const now = Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

export function ProjectViewPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const base = user ? roleBasePath[user.role] : "/";

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
        if (!cancelled) {
          setError(
            apiErrorMessage(err, "This project could not be loaded."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  const progress = project
    ? timelineProgress(project.startDate, project.endDate)
    : 0;

  return (
    <>
      <PageHeader
        title={project ? project.name : "Project"}
        breadcrumbs={[
          { label: "Projects", to: `${base}/projects` },
          { label: project ? project.name : "Details" },
        ]}
      />

      {loading ? (
        <LoadingState label="Loading project…" />
      ) : error || !project ? (
        <ErrorState
          title="Project unavailable"
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
                <Field
                  label="Status"
                  value={PROJECT_STATUS_LABELS[project.status]}
                />
                <Field label="Created by" value={project.createdBy} />
                <Field
                  label="Start date"
                  value={formatDate(project.startDate)}
                />
                <Field label="End date" value={formatDate(project.endDate)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDate(project.startDate)}</span>
                <span>{formatDate(project.endDate)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {Math.round(progress)}% of the scheduled timeline elapsed.
              </p>
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

          <ProjectMembers projectId={project.id} readOnly />
          {user?.role === "HR" && (
            <ProjectTasks projectId={project.id} readOnly />
          )}
        </div>
      )}
    </>
  );
}
