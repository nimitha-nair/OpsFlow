export interface TaskAttachment {
  id: string;
  taskId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  /** API path (relative to the API base) that streams the bytes. */
  url: string;
}
