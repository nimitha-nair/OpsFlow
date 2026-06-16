import { ProjectsVisibilityList } from "../../components/projects/ProjectsVisibilityList";

export function HrProjectsPage() {
  return (
    <ProjectsVisibilityList
      title="Projects"
      description="View all organization projects and their teams."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Projects" }]}
      basePath="/hr/projects"
      source="all"
      emptyTitle="No projects yet"
      emptyDescription="Projects will appear here once they are created."
    />
  );
}
