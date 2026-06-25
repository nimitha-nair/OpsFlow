import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { TaskStatus } from "../types/task.types";
import {
  createTask,
  deleteTask,
  getTaskById,
  isUserResponsibleForTask,
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
import { notify } from "../services/notification.service";
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
    // Cap fan-out to keep DEPARTMENT assignments (potentially large) bounded.
    await notify(
      task.assignment.userIds.slice(0, 50),
      {
        type: "TASK_ASSIGNED",
        title: "New task assigned",
        body: `You were assigned "${task.title}".`,
        taskId: task.id,
      },
      req.user.userId,
    );
    return res.status(201).json(task);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /tasks — ADMIN only: view all tasks (filterable, e.g. by projectId). */
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
    const { from, to } = (req.valid?.query ?? {}) as { from?: string; to?: string };
    const tasks = await listTasksForAssignee(req.user.userId, from, to);
    return res.status(200).json({ data: tasks });
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * GET /tasks/:id — ADMIN may view any task; everyone else (HR and EMPLOYEE) may
 * view a task only if they are responsible for it (direct or via department).
 */
export async function getTask(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const task = await getTaskById(id);

    // Only ADMIN sees any task; everyone else (HR included) is scoped to tasks
    // they are responsible for (direct or via their department).
    if (
      req.user.role !== UserRole.ADMIN &&
      !(await isUserResponsibleForTask(task, req.user.userId))
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

/** DELETE /tasks/:id — ADMIN only. */
export async function deleteTaskHandler(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    await deleteTask(id);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /tasks/:id — ADMIN only (full edit). */
export async function patchTask(req: Request, res: Response): Promise<Response> {
  try {
    const { id } = req.valid?.params as IdParams;
    const input = req.valid?.body as UpdateTaskInput;
    const before = await getTaskById(id);
    const task = await updateTask(id, input);

    const actor = req.user?.userId;
    const recipients = task.assignment.userIds.slice(0, 50);
    const beforeUsers = new Set(before.assignment.userIds);
    const afterUsers = new Set(task.assignment.userIds);
    const assignmentChanged =
      input.assignment !== undefined &&
      (beforeUsers.size !== afterUsers.size ||
        [...afterUsers].some((id) => !beforeUsers.has(id)));

    if (assignmentChanged) {
      await notify(recipients, {
        type: "TASK_ASSIGNED",
        title: "Task assigned to you",
        body: `You were assigned "${task.title}".`,
        taskId: task.id,
      }, actor);
    } else if (input.dueDate && before.dueDate !== task.dueDate) {
      await notify(recipients, {
        type: "TASK_DUE_DATE",
        title: "Task due date changed",
        body: `"${task.title}" is now due ${task.dueDate}.`,
        taskId: task.id,
      }, actor);
    } else {
      await notify(recipients, {
        type: "TASK_UPDATED",
        title: "Task updated",
        body: `"${task.title}" was updated.`,
        taskId: task.id,
      }, actor);
    }

    return res.status(200).json(task);
  } catch (err) {
    return handleError(res, err);
  }
}

/**
 * PATCH /tasks/:id/status — ADMIN may update any task's status; EMPLOYEE and HR
 * may update only tasks assigned to them, and only progress them (In Progress /
 * Review / On Hold) — completing or reopening stays admin-only.
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
    const { status, reason } = req.valid?.body as {
      status: TaskStatus;
      reason?: string;
    };

    const task = await getTaskById(id);
    // Non-admins (EMPLOYEE, HR) are self-service: own tasks only, limited moves.
    const restricted = req.user.role !== UserRole.ADMIN;

    if (
      restricted &&
      !(await isUserResponsibleForTask(task, req.user.userId))
    ) {
      return res
        .status(403)
        .json({ error: "You can only update tasks assigned to you" });
    }

    // Completed tasks are read-only for non-admins; only an admin can reopen them.
    if (task.status === "DONE" && restricted) {
      return res.status(403).json({
        error: "This task is completed and read-only. Ask an admin to reopen it.",
      });
    }

    // Non-admins can progress work but cannot complete or reopen a task — only
    // an admin marks DONE or moves a task back to TODO.
    const SELF_SERVICE_ALLOWED: TaskStatus[] = ["IN_PROGRESS", "REVIEW", "ON_HOLD"];
    if (restricted && !SELF_SERVICE_ALLOWED.includes(status)) {
      return res.status(403).json({
        error:
          status === "DONE"
            ? "Only an admin can mark a task as done."
            : "You can move tasks to In Progress, Review or On Hold only.",
      });
    }

    const updated = await updateTaskStatus(id, status, reason);
    await notify(
      [...task.assignment.userIds, task.createdBy].slice(0, 50),
      {
        type: "TASK_STATUS",
        title: "Task status changed",
        body: `"${task.title}" moved to ${status}.`,
        taskId: task.id,
      },
      req.user.userId,
    );
    return res.status(200).json(updated);
  } catch (err) {
    return handleError(res, err);
  }
}
