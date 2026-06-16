import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type {
  ProjectMember,
  ProjectMembersResponse,
} from "../types/projectMember";

/** GET /projects/:projectId/members */
export async function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  const { data } = await api.get<ProjectMembersResponse>(
    `/projects/${projectId}/members`,
  );
  return data.members;
}

/** POST /projects/:projectId/members */
export async function assignProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMember> {
  const { data } = await api.post<ProjectMember>(
    `/projects/${projectId}/members`,
    { userId },
  );
  return data;
}

/** DELETE /projects/:projectId/members/:userId */
export async function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<void> {
  await api.delete(`/projects/${projectId}/members/${userId}`);
}

export { apiErrorMessage };
