import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { TaskStatus } from "../types/task.types";
import {
  createTask,
  getTaskById,
  listTasks,
  listTasksForAssignee,
  updateTask,
  updateTaskStatus,
} from "../services/task.service";
import type {
  CreateTaskInput,
  ListTasksParams,
  UpdateTaskInput,
} from "../services/task.service";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected task-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** POST /tasks — ADMIN only. */
export async function postTask(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const input = req.valid?.body as Omit<CreateTaskInput, "createdBy">;
    const task = await createTask({ ...input, createdBy: req.user.userId });
    return res.status(201).json(task);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /tasks — ADMIN and HR may view (filterable, e.g. by projectId). */
export async function getTasks(req: Request, res: Response): Promise<Response> {
  try {
    const params = req.valid?.query as ListTasksParams;
    const result = await listTasks(params);
    return res.status(200).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /tasks/my-tasks — tasks assigned to the authenticated user. */
export async function getMyTasks(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const tasks = await listTasksForAssignee(req.user.userId);
    return res.status(200).json({ data: tasks });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /tasks/:id — ADMIN/HR may view any task; an EMPLOYEE may view a task
 * only if it is assigned to them.
 */
export async function getTask(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const task = await getTaskById(id);

    if (
      req.user.role === UserRole.EMPLOYEE &&
      task.assigneeId !== req.user.userId
    ) {
      return res
        .status(403)
        .json({ error: "You do not have access to this task" });
    }

    return res.status(200).json(task);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /tasks/:id — ADMIN only (full edit). */
export async function patchTask(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const input = req.valid?.body as UpdateTaskInput;
    const task = await updateTask(id, input);
    return res.status(200).json(task);
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * PATCH /tasks/:id/status — ADMIN may update any task's status; an EMPLOYEE may
 * update only tasks assigned to them. (HR is excluded at the route level.)
 */
export async function patchTaskStatus(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const { status } = req.valid?.body as { status: TaskStatus };

    const task = await getTaskById(id);
    if (
      req.user.role === UserRole.EMPLOYEE &&
      task.assigneeId !== req.user.userId
    ) {
      return res
        .status(403)
        .json({ error: "You can only update tasks assigned to you" });
    }

    // Completed tasks are read-only for employees; only an admin can reopen them.
    if (task.status === "DONE" && req.user.role === UserRole.EMPLOYEE) {
      return res.status(403).json({
        error: "This task is completed and read-only. Ask an admin to reopen it.",
      });
    }

    const updated = await updateTaskStatus(id, status);
    return res.status(200).json(updated);
  } catch (err) {
    return handleError(res, err);
  }
}
