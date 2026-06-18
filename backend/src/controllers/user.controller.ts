import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import {
  createUser,
  getUserById,
  listUsers,
  setUserStatus,
  updateUser,
} from "../services/user.service";
import type {
  CreateUserInput,
  ListUsersParams,
  UpdateUserInput,
} from "../services/user.service";
import type { IdParams } from "../validation/common";

/** Translate a thrown error into an HTTP response. */
function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected user-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** GET /users/me — the authenticated user's own profile. */
export async function getMe(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const user = await getUserById(req.user.userId);
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /users — paginated, searchable, filterable list. */
export async function getUsers(req: Request, res: Response): Promise<Response> {
  try {
    const params = req.valid?.query as ListUsersParams;
    const result = await listUsers(params);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /users/:id */
export async function getUser(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const user = await getUserById(id);
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /users */
export async function postUser(req: Request, res: Response): Promise<Response> {
  try {
    const input = req.valid?.body as CreateUserInput;
    const user = await createUser(input);
    return res.status(201).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /users/:id */
export async function patchUser(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const input = req.valid?.body as UpdateUserInput;
    const user = await updateUser(id, input, req.user.userId);
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /users/:id/status */
export async function patchUserStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const { isActive } = req.valid?.body as { isActive: boolean };
    const user = await setUserStatus(id, isActive, req.user.userId);
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}
