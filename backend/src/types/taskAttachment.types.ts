import type { Timestamp } from "firebase-admin/firestore";

/** A task attachment's metadata (collection: taskAttachments). Bytes live on disk. */
export interface TaskAttachmentDocument {
  id: string;
  taskId: string;
  /** Stored (on-disk) filename. */
  fileName: string;
  /** Original filename as uploaded (for display/download). */
  originalName: string;
  mimeType: string;
  size: number;
  /** Path relative to the backend root, e.g. uploads/tasks/<file>. */
  filePath: string;
  uploadedBy: string;
  uploadedAt: Timestamp;
}

/** Client-facing attachment; uploadedAt as ISO + a stream url. */
export interface TaskAttachment {
  id: string;
  taskId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  /** API path (relative to the API base) to stream the bytes. */
  url: string;
}
