import type { Request, Response } from "express";

import UserRole from "../types/roles";
import { ApiError } from "../utils/errors";
import {
  createUser,
  getUserById,
  listUsers,
  setUserStatus,
  updateUser,
  type CreateUserInput,
  type ListUsersParams,
  type UpdateUserInput,
} from "../services/user.service";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUserRole(value: string): value is UserRole {
  return (Object.values(UserRole) as string[]).includes(value);
}

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

/** Translate a thrown error into an HTTP response. */
function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected user-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

function parseListQuery(query: Request["query"]): ListUsersParams {
  const params: ListUsersParams = {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  };

  if (typeof query.page === "string") {
    const page = Number.parseInt(query.page, 10);
    if (Number.isFinite(page) && page >= 1) {
      params.page = page;
    }
  }

  if (typeof query.limit === "string") {
    const limit = Number.parseInt(query.limit, 10);
    if (Number.isFinite(limit) && limit >= 1) {
      params.limit = Math.min(limit, MAX_LIMIT);
    }
  }

  if (typeof query.search === "string" && query.search.trim() !== "") {
    params.search = query.search.trim();
  }

  if (typeof query.role === "string") {
    if (!isUserRole(query.role)) {
      throw new ApiError(400, "role must be one of ADMIN, HR, EMPLOYEE");
    }
    params.role = query.role;
  }

  if (typeof query.isActive === "string") {
    if (query.isActive === "true") {
      params.isActive = true;
    } else if (query.isActive === "false") {
      params.isActive = false;
    } else {
      throw new ApiError(400, "isActive must be 'true' or 'false'");
    }
  }

  return params;
}

function validateCreateInput(body: unknown): CreateUserInput {
  const { name, email, password, role, department, isActive } = (body ??
    {}) as Record<string, unknown>;

  const errors: string[] = [];

  if (typeof name !== "string" || name.trim() === "") {
    errors.push("name is required");
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    errors.push("a valid email is required");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (typeof role !== "string" || !isUserRole(role)) {
    errors.push("role must be one of ADMIN, HR, EMPLOYEE");
  }
  if (department !== undefined && typeof department !== "string") {
    errors.push("department must be a string");
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join("; "));
  }

  const input: CreateUserInput = {
    name: name as string,
    email: email as string,
    password: password as string,
    role: role as UserRole,
  };
  if (department !== undefined) {
    input.department = department as string;
  }
  if (isActive !== undefined) {
    input.isActive = isActive as boolean;
  }
  return input;
}

function validateUpdateInput(body: unknown): UpdateUserInput {
  const { name, email, role, department } = (body ?? {}) as Record<
    string,
    unknown
  >;

  const errors: string[] = [];
  const input: UpdateUserInput = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim() === "") {
      errors.push("name must be a non-empty string");
    } else {
      input.name = name;
    }
  }
  if (email !== undefined) {
    if (typeof email !== "string" || !isValidEmail(email)) {
      errors.push("email must be a valid email address");
    } else {
      input.email = email;
    }
  }
  if (role !== undefined) {
    if (typeof role !== "string" || !isUserRole(role)) {
      errors.push("role must be one of ADMIN, HR, EMPLOYEE");
    } else {
      input.role = role;
    }
  }
  if (department !== undefined) {
    if (typeof department !== "string") {
      errors.push("department must be a string");
    } else {
      input.department = department;
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join("; "));
  }
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }
  return input;
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
    const params = parseListQuery(req.query);
    const result = await listUsers(params);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /users/:id */
export async function getUser(req: Request, res: Response): Promise<Response> {
  try {
    const user = await getUserById(req.params.id as string);
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /users */
export async function postUser(req: Request, res: Response): Promise<Response> {
  try {
    const input = validateCreateInput(req.body);
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
    const input = validateUpdateInput(req.body);
    const user = await updateUser(
      req.params.id as string,
      input,
      req.user.userId,
    );
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
  const { isActive } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof isActive !== "boolean") {
    return res
      .status(400)
      .json({ error: "isActive is required and must be a boolean" });
  }
  try {
    const user = await setUserStatus(
      req.params.id as string,
      isActive,
      req.user.userId,
    );
    return res.status(200).json(user);
  } catch (err) {
    return handleError(res, err);
  }
}
