import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { Project } from "../types/project.types";
import {
  createProject,
  getProjectById,
  listProjects,
  setProjectArchived,
  stripBudget,
  updateProject,
} from "../services/project.service";
import {
  getProjectIdsForUser,
  isProjectMember,
} from "../services/projectMember.service";
import type {
  CreateProjectInput,
  ListProjectsParams,
  UpdateProjectInput,
} from "../services/project.service";
import type { IdParams } from "../validation/common";

/** Translate a thrown error into an HTTP response. */
function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected project-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Budget is visible to ADMIN only; everyone else gets a stripped view. */
function viewForRole(project: Project, role: string) {
  return role === UserRole.ADMIN ? project : stripBudget(project);
}

/** GET /projects — ADMIN (with budget) and HR (budget hidden). */
export async function getProjects(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const params = req.valid?.query as ListProjectsParams;
    const result = await listProjects(params);
    const data =
      req.user.role === UserRole.ADMIN
        ? result.data
        : result.data.map(stripBudget);
    return res.status(200).json({ data, pagination: result.pagination });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /projects/my-projects — the authenticated user's assigned projects only.
 * Budget is always hidden here (team-member view).
 */
export async function getMyProjects(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const ids = await getProjectIdsForUser(req.user.userId);
    const projects = (
      await Promise.all(ids.map((id) => getProjectById(id).catch(() => null)))
    ).filter((p): p is Project => p !== null);
    return res.status(200).json({ data: projects.map(stripBudget) });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /projects/:id — ADMIN/HR may view any project; an EMPLOYEE may view a
 * project only if assigned to it. Budget is hidden for non-ADMIN roles.
 */
export async function getProject(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const project = await getProjectById(id);

    if (req.user.role === UserRole.EMPLOYEE) {
      const member = await isProjectMember(id, req.user.userId);
      if (!member) {
        return res
          .status(403)
          .json({ error: "You do not have access to this project" });
      }
    }

    return res.status(200).json(viewForRole(project, req.user.role));
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /projects */
export async function postProject(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const input = req.valid?.body as Omit<CreateProjectInput, "createdBy">;
    const project = await createProject({
      ...input,
      createdBy: req.user.userId,
    });
    return res.status(201).json(project);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /projects/:id */
export async function patchProject(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const input = req.valid?.body as UpdateProjectInput;
    const project = await updateProject(id, input);
    return res.status(200).json(project);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /projects/:id/archive — ADMIN makes the project read-only. */
export async function patchArchiveProject(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const project = await setProjectArchived(id, true);
    return res.status(200).json(project);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /projects/:id/unarchive — ADMIN restores a project to editable. */
export async function patchUnarchiveProject(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const project = await setProjectArchived(id, false);
    return res.status(200).json(project);
  } catch (err) {
    return handleError(res, err);
  }
}
