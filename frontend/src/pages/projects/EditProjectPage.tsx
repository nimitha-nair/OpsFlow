import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ErrorState } from "../../components/common/ErrorState";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ProjectForm } from "../../components/projects/ProjectForm";
import { buildProjectPayload } from "../../components/projects/project-form.types";
import type { ProjectFormValues } from "../../components/projects/project-form.types";
import {
  apiErrorMessage,
  getProject,
  updateProject,
} from "../../lib/projects-api";

export function EditProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [initial, setInitial] = useState<ProjectFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const projectId = id;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const project = await getProject(projectId);
        if (!cancelled) {
          setInitial({
            name: project.name,
            description: project.description,
            clientName: project.clientName,
            budget: String(project.budget),
            status: project.status,
            startDate: project.startDate,
            endDate: project.endDate,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(apiErrorMessage(err, "Project not found."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(values: ProjectFormValues) {
    if (!id) return;
    const result = buildProjectPayload(values);
    if ("error" in result) {
      setSubmitError(result.error);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await updateProject(id, result.payload);
      toast.success("Project updated.");
      navigate(`/admin/projects/${id}`);
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "Failed to update project."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Edit Project"
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Projects", to: "/admin/projects" },
          { label: "Edit" },
        ]}
      />

      {loading ? (
        <LoadingState label="Loading project…" />
      ) : loadError || !initial ? (
        <ErrorState
          title="Couldn't load project"
          description={loadError ?? "This project could not be found."}
          onRetry={() => navigate("/admin/projects")}
          retryLabel="Back to projects"
        />
      ) : (
        <ProjectForm
          mode="edit"
          initialValues={initial}
          submitting={submitting}
          error={submitError}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/admin/projects/${id}`)}
        />
      )}
    </>
  );
}
