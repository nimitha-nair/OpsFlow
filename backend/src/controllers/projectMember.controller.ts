import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import {
  assignMember,
  listMembers,
  removeMember,
} from "../services/projectMember.service";
import type { AssignMemberInput } from "../validation/projectMember.schema";

interface ProjectIdParams {
  projectId: string;
}
interface MemberParams {
  projectId: string;
  userId: string;
}

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected project-member-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** POST /projects/:projectId/members — ADMIN only. */
export async function postMember(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { projectId } = req.valid?.params as ProjectIdParams;
    const { userId } = req.valid?.body as AssignMemberInput;
    const member = await assignMember({
      projectId,
      userId,
      assignedBy: req.user.userId,
    });
    return res.status(201).json(member);
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /projects/:projectId/members — ADMIN and HR may view any project's team;
 * an EMPLOYEE may only view teams of projects they belong to.
 */
export async function getMembers(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { projectId } = req.valid?.params as ProjectIdParams;
    const members = await listMembers(projectId);

    if (
      req.user.role === UserRole.EMPLOYEE &&
      !members.some((m) => m.userId === req.user?.userId)
    ) {
      return res
        .status(403)
        .json({ error: "You do not have access to this project's members" });
    }

    return res.status(200).json({ members });
  } catch (err) {
    return handleError(res, err);
  }
}

/** DELETE /projects/:projectId/members/:userId — ADMIN only. */
export async function deleteMember(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId, userId } = req.valid?.params as MemberParams;
    await removeMember(projectId, userId);
    return res.status(200).json({ success: true });
  } catch (err) {
    return handleError(res, err);
  }
}
