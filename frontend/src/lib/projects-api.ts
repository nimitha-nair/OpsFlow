import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type {
  CreateProjectPayload,
  ListProjectsParams,
  Project,
  ProjectsListResponse,
  UpdateProjectPayload,
} from "../types/project";

/** GET /projects — paginated, filterable list (ADMIN/HR). */
export async function listProjects(
  params: ListProjectsParams = {},
): Promise<ProjectsListResponse> {
  const { data } = await api.get<ProjectsListResponse>("/projects", { params });
  return data;
}

/**
 * GET /projects/my-projects — projects the authenticated user is assigned to.
 * Budget is omitted by the backend for this view.
 */
export async function listMyProjects(): Promise<Project[]> {
  const { data } = await api.get<{ data: Project[] }>("/projects/my-projects");
  return data.data;
}

/** GET /projects/:id (budget omitted by the backend for non-admin roles). */
export async function getProject(id: string): Promise<Project> {
  const { data } = await api.get<Project>(`/projects/${id}`);
  return data;
}

/** POST /projects (ADMIN) */
export async function createProject(
  payload: CreateProjectPayload,
): Promise<Project> {
  const { data } = await api.post<Project>("/projects", payload);
  return data;
}

/** PATCH /projects/:id (ADMIN) */
export async function updateProject(
  id: string,
  payload: UpdateProjectPayload,
): Promise<Project> {
  const { data } = await api.patch<Project>(`/projects/${id}`, payload);
  return data;
}

export { apiErrorMessage };
