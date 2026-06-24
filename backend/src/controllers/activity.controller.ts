import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import { listActivity } from "../services/activity.service";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected activity-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/**
 * GET /activity — staff (ADMIN/HR) get organization-wide activity; employees
 * get only their own tickets/tasks/expenses.
 */
export async function getActivity(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const query = req.valid?.query as { limit?: number; from?: string; to?: string } | undefined;
    const limit = query?.limit;
    const from = query?.from;
    const to = query?.to;
    // Admin → full org-wide feed; HR → compliance feed (expenses + tickets,
    // no task/user/project); Employee → only their own activity.
    const scope =
      req.user.role === UserRole.ADMIN
        ? {}
        : req.user.role === UserRole.HR
          ? { hrOnly: true }
          : { scopeUserId: req.user.userId };
    const data = await listActivity({
      ...scope,
      ...(limit ? { limit } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err);
  }
}
