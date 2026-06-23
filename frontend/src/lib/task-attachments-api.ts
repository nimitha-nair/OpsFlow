import { api } from "./api";
import type { TaskAttachment } from "../types/taskAttachment";

/** GET /tasks/:taskId/attachments */
export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const { data } = await api.get<{ data: TaskAttachment[] }>(
    `/tasks/${taskId}/attachments`,
  );
  return data.data;
}

/** POST /tasks/:taskId/attachments (multipart) */
export async function uploadTaskAttachment(
  taskId: string,
  file: File,
): Promise<TaskAttachment> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<TaskAttachment>(
    `/tasks/${taskId}/attachments`,
    form,
  );
  return data;
}

/** DELETE /tasks/:taskId/attachments/:attachmentId */
export async function deleteTaskAttachment(
  taskId: string,
  attachmentId: string,
): Promise<void> {
  await api.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
}

/**
 * Fetch an attachment's bytes (authenticated) and return a temporary object URL.
 * Caller must revoke it with URL.revokeObjectURL.
 */
export async function fetchTaskAttachmentObjectUrl(
  taskId: string,
  attachmentId: string,
  download = false,
): Promise<string> {
  const { data } = await api.get<Blob>(
    `/tasks/${taskId}/attachments/${attachmentId}/file`,
    { params: download ? { download: 1 } : undefined, responseType: "blob" },
  );
  return URL.createObjectURL(data);
}
