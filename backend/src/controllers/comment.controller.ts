import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import { getTaskById, isUserResponsibleForTask } from "../services/task.service";
import {
  createComment,
  deleteComment,
  listCommentsForTask,
} from "../services/comment.service";
import { notify } from "../services/notification.service";
import type {
  CommentParams,
  TaskIdParams,
} from "../validation/comment.schema";
import type { CreateCommentInput } from "../services/comment.service";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected comment-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Ensure the requester may view the task (employees only their own). 404/403. */
async function assertTaskAccess(
  req: Request,
  taskId: string,
): Promise<void> {
  const task = await getTaskById(taskId); // throws 404 if absent
  if (
    req.user!.role !== UserRole.ADMIN &&
    !(await isUserResponsibleForTask(task, req.user!.userId))
  ) {
    throw new ApiError(403, "You do not have access to this task");
  }
}

/** GET /tasks/:taskId/comments */
export async function getComments(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId } = req.valid?.params as TaskIdParams;
    await assertTaskAccess(req, taskId);
    const comments = await listCommentsForTask(taskId);
    return res.status(200).json({ data: comments });
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /tasks/:taskId/comments */
export async function postComment(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId } = req.valid?.params as TaskIdParams;
    await assertTaskAccess(req, taskId);
    const input = req.valid?.body as CreateCommentInput;
    const comment = await createComment(taskId, req.user.userId, input);

    // Notify mentioned users, then the task's assignee + creator.
    const author = req.user.userId;
    const task = await getTaskById(taskId);
    const mentioned = comment.mentions ?? [];
    await notify(
      mentioned,
      {
        type: "MENTION",
        title: "You were mentioned",
        body: `${comment.authorName} mentioned you on "${task.title}".`,
        taskId,
      },
      author,
    );
    const others = [...task.assignment.userIds, task.createdBy].filter(
      (u) => u !== author && !mentioned.includes(u),
    );
    await notify(
      others,
      {
        type: comment.parentId ? "REPLY" : "COMMENT",
        title: comment.parentId ? "New reply" : "New comment",
        body: `${comment.authorName} commented on "${task.title}".`,
        taskId,
      },
      author,
    );

    return res.status(201).json(comment);
  } catch (err) {
    return handleError(res, err);
  }
}

/** DELETE /tasks/:taskId/comments/:commentId */
export async function deleteCommentHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId, commentId } = req.valid?.params as CommentParams;
    await assertTaskAccess(req, taskId);
    await deleteComment(
      taskId,
      commentId,
      req.user.userId,
      req.user.role === UserRole.ADMIN,
    );
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}
