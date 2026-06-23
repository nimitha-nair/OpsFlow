import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import type {
  TaskAttachment,
  TaskAttachmentDocument,
} from "../types/taskAttachment.types";

const ATTACHMENTS_COLLECTION = "taskAttachments";

export const BACKEND_ROOT = resolve(__dirname, "../..");
export const TASK_UPLOAD_DIR = join(BACKEND_ROOT, "uploads", "tasks");
const REL_UPLOAD_DIR = "uploads/tasks";

/** Max attachment size (10 MB) and how many a task may hold. */
export const TASK_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_TASK_ATTACHMENTS = 20;

/** Allowed types: screenshots/images, PDFs, and common office documents. */
export const TASK_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function tsMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function toPublic(a: TaskAttachmentDocument): TaskAttachment {
  return {
    id: a.id,
    taskId: a.taskId,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
    uploadedBy: a.uploadedBy,
    uploadedAt: tsIso(a.uploadedAt),
    url: `/tasks/${a.taskId}/attachments/${a.id}/file`,
  };
}

/** List a task's attachments, newest first. */
export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const snap = await db
    .collection(ATTACHMENTS_COLLECTION)
    .where("taskId", "==", taskId)
    .get();
  const rows: TaskAttachmentDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<TaskAttachmentDocument, "id">),
  }));
  rows.sort((a, b) => tsMillis(b.uploadedAt) - tsMillis(a.uploadedAt));
  return rows.map(toPublic);
}

export interface RecordAttachmentInput {
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
}

/** Record metadata for a file multer already wrote to TASK_UPLOAD_DIR. */
export async function recordTaskAttachment(
  taskId: string,
  input: RecordAttachmentInput,
): Promise<TaskAttachment> {
  const count = (
    await db.collection(ATTACHMENTS_COLLECTION).where("taskId", "==", taskId).get()
  ).size;
  if (count >= MAX_TASK_ATTACHMENTS) {
    // Clean up the just-written file before refusing.
    await unlink(join(TASK_UPLOAD_DIR, input.fileName)).catch(() => {});
    throw new ApiError(400, `A task can hold at most ${MAX_TASK_ATTACHMENTS} files`);
  }
  const data = {
    taskId,
    fileName: input.fileName,
    originalName: input.originalName,
    mimeType: input.mimeType,
    size: input.size,
    filePath: `${REL_UPLOAD_DIR}/${input.fileName}`,
    uploadedBy: input.uploadedBy,
    uploadedAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(ATTACHMENTS_COLLECTION).add(data);
  const created = await ref.get();
  return toPublic({
    id: ref.id,
    ...(created.data() as Omit<TaskAttachmentDocument, "id">),
  });
}

async function getDoc(
  taskId: string,
  attachmentId: string,
): Promise<TaskAttachmentDocument> {
  const snap = await db.collection(ATTACHMENTS_COLLECTION).doc(attachmentId).get();
  if (!snap.exists) throw new ApiError(404, "Attachment not found");
  const doc = { id: snap.id, ...(snap.data() as Omit<TaskAttachmentDocument, "id">) };
  if (doc.taskId !== taskId) throw new ApiError(404, "Attachment not found");
  return doc;
}

/** Resolve an attachment's bytes for streaming (returns stream + metadata). */
export async function openTaskAttachment(
  taskId: string,
  attachmentId: string,
): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; originalName: string }> {
  const doc = await getDoc(taskId, attachmentId);
  return {
    stream: createReadStream(join(BACKEND_ROOT, doc.filePath)),
    mimeType: doc.mimeType,
    originalName: doc.originalName,
  };
}

/** Delete an attachment (uploader or admin). Removes the file + metadata. */
export async function deleteTaskAttachment(
  taskId: string,
  attachmentId: string,
  requesterId: string,
  isAdmin: boolean,
): Promise<void> {
  const doc = await getDoc(taskId, attachmentId);
  if (!isAdmin && doc.uploadedBy !== requesterId) {
    throw new ApiError(403, "You can only delete attachments you uploaded");
  }
  await unlink(join(BACKEND_ROOT, doc.filePath)).catch(() => {});
  await db.collection(ATTACHMENTS_COLLECTION).doc(attachmentId).delete();
}
