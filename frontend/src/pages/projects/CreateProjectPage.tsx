import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PageHeader } from "../../components/layout/PageHeader";
import { ProjectForm } from "../../components/projects/ProjectForm";
import {
  buildProjectPayload,
  emptyProjectForm,
} from "../../components/projects/project-form.types";
import type { ProjectFormValues } from "../../components/projects/project-form.types";
import { apiErrorMessage, createProject } from "../../lib/projects-api";

export function CreateProjectPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: ProjectFormValues) {
    const result = buildProjectPayload(values);
    if ("error" in result) {
      setError(result.error);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject(result.payload);
      toast.success("Project created.");
      navigate(`/admin/projects/${project.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to create project."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New Project"
        breadcrumbs={[
          { label: "Admin", to: "/admin" },
          { label: "Projects", to: "/admin/projects" },
          { label: "New" },
        ]}
      />
      <ProjectForm
        mode="create"
        initialValues={emptyProjectForm}
        submitting={submitting}
        error={error}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/admin/projects")}
      />
    </>
  );
}
