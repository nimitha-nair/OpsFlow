import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import type { Comment, CommentDocument } from "../types/comment.types";

const COMMENTS_COLLECTION = "taskComments";

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function tsMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function toPublicComment(c: CommentDocument): Comment {
  const result: Comment = {
    id: c.id,
    taskId: c.taskId,
    authorId: c.authorId,
    authorName: c.authorName,
    body: c.body,
    mentions: c.mentions ?? [],
    createdAt: tsIso(c.createdAt),
    updatedAt: tsIso(c.updatedAt),
  };
  if (c.parentId !== undefined) result.parentId = c.parentId;
  return result;
}

export interface CreateCommentInput {
  body: string;
  parentId?: string;
  mentions?: string[];
}

/** List a task's comments, oldest first (sorted in memory — no composite index). */
export async function listCommentsForTask(taskId: string): Promise<Comment[]> {
  const snap = await db
    .collection(COMMENTS_COLLECTION)
    .where("taskId", "==", taskId)
    .get();
  const rows: CommentDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CommentDocument, "id">),
  }));
  rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  return rows.map(toPublicComment);
}

/** Create a comment (or reply, when parentId is set). */
export async function createComment(
  taskId: string,
  authorId: string,
  input: CreateCommentInput,
): Promise<Comment> {
  const userSnap = await db.collection("users").doc(authorId).get();
  const authorName = (userSnap.data()?.name as string | undefined) ?? "Unknown";

  const now = FieldValue.serverTimestamp();
  const data: Record<string, unknown> = {
    taskId,
    authorId,
    authorName,
    body: input.body.trim(),
    mentions: input.mentions ?? [],
    createdAt: now,
    updatedAt: now,
  };
  if (input.parentId) data.parentId = input.parentId;

  const ref = await db.collection(COMMENTS_COLLECTION).add(data);
  const created = await ref.get();
  return toPublicComment({
    id: ref.id,
    ...(created.data() as Omit<CommentDocument, "id">),
  });
}

/** Delete a comment. The author or an admin may delete; others get 403. */
export async function deleteComment(
  taskId: string,
  commentId: string,
  requesterId: string,
  isAdmin: boolean,
): Promise<void> {
  const snap = await db.collection(COMMENTS_COLLECTION).doc(commentId).get();
  if (!snap.exists) {
    throw new ApiError(404, "Comment not found");
  }
  const c = snap.data() as Omit<CommentDocument, "id">;
  if (c.taskId !== taskId) {
    throw new ApiError(404, "Comment not found");
  }
  if (!isAdmin && c.authorId !== requesterId) {
    throw new ApiError(403, "You can only delete your own comments");
  }
  await db.collection(COMMENTS_COLLECTION).doc(commentId).delete();
}
