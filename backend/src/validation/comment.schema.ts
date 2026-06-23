import { z } from "zod";

import { firestoreId } from "./common";

/** POST /tasks/:taskId/comments */
export const createCommentBody = z
  .object({
    body: z.string().trim().min(1).max(2000),
    /** Optional — present when replying to another comment. */
    parentId: firestoreId.optional(),
    /** User ids mentioned in the body. */
    mentions: z.array(firestoreId).max(50).optional().default([]),
  })
  .strict();

export const taskIdParams = z.object({ taskId: firestoreId });
export const commentParams = z.object({
  taskId: firestoreId,
  commentId: firestoreId,
});
export const attachmentParams = z.object({
  taskId: firestoreId,
  attachmentId: firestoreId,
});

export type TaskIdParams = z.infer<typeof taskIdParams>;
export type CommentParams = z.infer<typeof commentParams>;
export type AttachmentParams = z.infer<typeof attachmentParams>;
