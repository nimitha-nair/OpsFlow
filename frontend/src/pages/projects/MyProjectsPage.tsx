import { ProjectsVisibilityList } from "../../components/projects/ProjectsVisibilityList";

export function MyProjectsPage() {
  return (
    <ProjectsVisibilityList
      title="My Projects"
      description="Projects you are assigned to."
      breadcrumbs={[
        { label: "Employee", to: "/employee" },
        { label: "My Projects" },
      ]}
      basePath="/employee/projects"
      source="mine"
      emptyTitle="No assigned projects"
      emptyDescription="Projects you are added to will appear here."
    />
  );
}
