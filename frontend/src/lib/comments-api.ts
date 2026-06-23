import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type { Comment } from "../types/comment";

/** GET /tasks/:taskId/comments */
export async function listComments(taskId: string): Promise<Comment[]> {
  const { data } = await api.get<{ data: Comment[] }>(
    `/tasks/${taskId}/comments`,
  );
  return data.data;
}

/** POST /tasks/:taskId/comments */
export async function createComment(
  taskId: string,
  payload: { body: string; parentId?: string; mentions?: string[] },
): Promise<Comment> {
  const { data } = await api.post<Comment>(
    `/tasks/${taskId}/comments`,
    payload,
  );
  return data;
}

/** DELETE /tasks/:taskId/comments/:commentId */
export async function deleteComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  await api.delete(`/tasks/${taskId}/comments/${commentId}`);
}

export { apiErrorMessage };
