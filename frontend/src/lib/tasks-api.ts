import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type {
  CreateTaskPayload,
  ListTasksParams,
  Task,
  TasksListResponse,
  TaskStatus,
  UpdateTaskPayload,
} from "../types/task";

/**
 * Guarantee every task has a valid `assignment`. Tasks created before the
 * assignment migration (or not yet backfilled) may arrive without one — left
 * unguarded, reading `task.assignment.userIds` crashes the board. Synthesize a
 * safe assignment, recovering a legacy single `assigneeId` when present.
 */
function normalizeTask(raw: Task): Task {
  if (raw.assignment && Array.isArray(raw.assignment.userIds)) return raw;
  const legacy = (raw as { assigneeId?: string }).assigneeId;
  return {
    ...raw,
    assignment: {
      type: "INDIVIDUAL",
      userIds: typeof legacy === "string" && legacy ? [legacy] : [],
    },
  };
}

/** GET /tasks — ADMIN/HR, filterable (e.g. by projectId). */
export async function listTasks(
  params: ListTasksParams = {},
): Promise<Task[]> {
  const { data } = await api.get<TasksListResponse>("/tasks", { params });
  return data.data.map(normalizeTask);
}

/** GET /tasks/my-tasks — tasks assigned to the authenticated user. */
export async function listMyTasks(
  params?: { from?: string; to?: string },
): Promise<Task[]> {
  const { data } = await api.get<{ data: Task[] }>("/tasks/my-tasks", { params });
  return data.data.map(normalizeTask);
}

/** GET /tasks/:id */
export async function getTask(id: string): Promise<Task> {
  const { data } = await api.get<Task>(`/tasks/${id}`);
  return normalizeTask(data);
}

/** POST /tasks (ADMIN) */
export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const { data } = await api.post<Task>("/tasks", payload);
  return normalizeTask(data);
}

/** PATCH /tasks/:id (ADMIN) */
export async function updateTask(
  id: string,
  payload: UpdateTaskPayload,
): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}`, payload);
  return normalizeTask(data);
}

/** PATCH /tasks/:id/status (ADMIN any, EMPLOYEE own). `reason` required for ON_HOLD. */
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  reason?: string,
): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}/status`, {
    status,
    ...(reason ? { reason } : {}),
  });
  return normalizeTask(data);
}

/** DELETE /tasks/:id (ADMIN) */
export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export { apiErrorMessage };
