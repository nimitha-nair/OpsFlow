import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import {
  listForUser,
  markAllRead,
  markRead,
} from "../services/notification.service";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected notification-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** GET /notifications — the authenticated user's notifications. */
export async function getNotifications(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const data = await listForUser(req.user.userId);
    return res.status(200).json({
      data,
      unread: data.filter((n) => !n.read).length,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /notifications/:id/read */
export async function patchNotificationRead(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    await markRead(id, req.user.userId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /notifications/read-all */
export async function patchAllRead(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const count = await markAllRead(req.user.userId);
    return res.status(200).json({ updated: count });
  } catch (err) {
    return handleError(res, err);
  }
}
