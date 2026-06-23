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

/** GET /tasks — ADMIN/HR, filterable (e.g. by projectId). */
export async function listTasks(
  params: ListTasksParams = {},
): Promise<Task[]> {
  const { data } = await api.get<TasksListResponse>("/tasks", { params });
  return data.data;
}

/** GET /tasks/my-tasks — tasks assigned to the authenticated user. */
export async function listMyTasks(): Promise<Task[]> {
  const { data } = await api.get<{ data: Task[] }>("/tasks/my-tasks");
  return data.data;
}

/** GET /tasks/:id */
export async function getTask(id: string): Promise<Task> {
  const { data } = await api.get<Task>(`/tasks/${id}`);
  return data;
}

/** POST /tasks (ADMIN) */
export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const { data } = await api.post<Task>("/tasks", payload);
  return data;
}

/** PATCH /tasks/:id (ADMIN) */
export async function updateTask(
  id: string,
  payload: UpdateTaskPayload,
): Promise<Task> {
  const { data } = await api.patch<Task>(`/tasks/${id}`, payload);
  return data;
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
  return data;
}

/** DELETE /tasks/:id (ADMIN) */
export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export { apiErrorMessage };
