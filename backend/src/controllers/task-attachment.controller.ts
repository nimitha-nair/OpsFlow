import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import { getTaskById } from "../services/task.service";
import {
  deleteTaskAttachment,
  listTaskAttachments,
  openTaskAttachment,
  recordTaskAttachment,
} from "../services/task-attachment.service";
import type {
  AttachmentParams,
  TaskIdParams,
} from "../validation/comment.schema";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected task-attachment error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

async function assertTaskAccess(req: Request, taskId: string): Promise<void> {
  const task = await getTaskById(taskId);
  if (
    req.user!.role === UserRole.EMPLOYEE &&
    task.assigneeId !== req.user!.userId
  ) {
    throw new ApiError(403, "You do not have access to this task");
  }
}

/** GET /tasks/:taskId/attachments */
export async function getAttachments(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId } = req.valid?.params as TaskIdParams;
    await assertTaskAccess(req, taskId);
    const data = await listTaskAttachments(taskId);
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /tasks/:taskId/attachments (multipart "file") */
export async function postAttachment(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId } = req.valid?.params as TaskIdParams;
    await assertTaskAccess(req, taskId);
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const attachment = await recordTaskAttachment(taskId, {
      fileName: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: req.user.userId,
    });
    return res.status(201).json(attachment);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /tasks/:taskId/attachments/:attachmentId/file — stream the bytes. */
export async function getAttachmentFile(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const { taskId, attachmentId } = req.valid?.params as AttachmentParams;
    await assertTaskAccess(req, taskId);
    const { stream, mimeType, originalName } = await openTaskAttachment(
      taskId,
      attachmentId,
    );
    const disposition = req.query.download ? "attachment" : "inline";
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${originalName.replace(/"/g, "")}"`,
    );
    stream.on("error", () => {
      if (!res.headersSent) res.status(404).json({ error: "File not found" });
    });
    stream.pipe(res);
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

/** DELETE /tasks/:taskId/attachments/:attachmentId */
export async function deleteAttachmentHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { taskId, attachmentId } = req.valid?.params as AttachmentParams;
    await assertTaskAccess(req, taskId);
    await deleteTaskAttachment(
      taskId,
      attachmentId,
      req.user.userId,
      req.user.role === UserRole.ADMIN,
    );
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}
