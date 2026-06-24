import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { filterByDateWindow } from "../utils/date-window";
import type {
  Task,
  TaskDocument,
  TaskPriority,
  TaskStatus,
} from "../types/task.types";
import { assertProjectNotArchived, getProjectById } from "./project.service";
import { isProjectMember } from "./projectMember.service";
import { generateCode } from "./code-generator";

const TASKS_COLLECTION = "tasks";

export interface CreateTaskInput {
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version?: string;
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assigneeId?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueDate?: string;
  version?: string;
}

export interface ListTasksParams {
  page: number;
  limit: number;
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  from?: string;
  to?: string;
  version?: string;
}

export interface PaginatedTasks {
  data: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function timestampToMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function timestampToIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function toPublicTask(task: TaskDocument): Task {
  return {
    id: task.id,
    ...(task.code !== undefined ? { code: task.code } : {}),
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    ...(task.version !== undefined ? { version: task.version } : {}),
    ...(task.onHoldReason !== undefined
      ? { onHoldReason: task.onHoldReason }
      : {}),
    createdBy: task.createdBy,
    createdAt: timestampToIso(task.createdAt),
    updatedAt: timestampToIso(task.updatedAt),
  };
}

async function getTaskDocById(id: string): Promise<TaskDocument | null> {
  const snap = await db.collection(TASKS_COLLECTION).doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<TaskDocument, "id">) };
}

/** Internal: fetch the raw task (for authorization checks). 404 if absent. */
export async function getTaskDocumentById(id: string): Promise<TaskDocument> {
  const task = await getTaskDocById(id);
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  return task;
}

/** Fetch a single task by id, throwing 404 if absent. */
export async function getTaskById(id: string): Promise<Task> {
  return toPublicTask(await getTaskDocumentById(id));
}

/** Delete a task. Throws 404 if it does not exist. */
export async function deleteTask(id: string): Promise<void> {
  const task = await getTaskDocById(id);
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  await db.collection(TASKS_COLLECTION).doc(id).delete();
}

/** Assert the project exists and the assignee is a member of it. */
async function assertAssigneeIsMember(
  projectId: string,
  assigneeId: string,
): Promise<void> {
  // Project must exist (reuses Projects CRUD; throws 404 otherwise).
  await getProjectById(projectId);
  if (!(await isProjectMember(projectId, assigneeId))) {
    throw new ApiError(
      400,
      "Assignee must already be assigned to the project",
    );
  }
}

/** Create a task. Validates the project is active and the assignee is a member. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  await assertProjectNotArchived(input.projectId);
  await assertAssigneeIsMember(input.projectId, input.assigneeId);

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(TASKS_COLLECTION).add({
    code: await generateCode("task"),
    projectId: input.projectId,
    title: input.title.trim(),
    description: input.description.trim(),
    assigneeId: input.assigneeId,
    priority: input.priority,
    status: input.status,
    dueDate: input.dueDate,
    ...(input.version ? { version: input.version } : {}),
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  });

  const created = await getTaskDocById(ref.id);
  if (!created) {
    throw new ApiError(500, "Failed to load the created task");
  }
  return toPublicTask(created);
}

/** List tasks with in-memory filtering and pagination (ordered newest first). */
export async function listTasks(
  params: ListTasksParams,
): Promise<PaginatedTasks> {
  const snapshot = await db
    .collection(TASKS_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();

  let tasks: TaskDocument[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TaskDocument, "id">),
  }));

  if (params.projectId !== undefined) {
    tasks = tasks.filter((t) => t.projectId === params.projectId);
  }
  if (params.status !== undefined) {
    tasks = tasks.filter((t) => t.status === params.status);
  }
  if (params.priority !== undefined) {
    tasks = tasks.filter((t) => t.priority === params.priority);
  }
  if (params.assigneeId !== undefined) {
    tasks = tasks.filter((t) => t.assigneeId === params.assigneeId);
  }
  tasks = filterByDateWindow(tasks, (t) => t.dueDate, params.from, params.to);
  if (params.version !== undefined) {
    tasks = tasks.filter((t) => t.version === params.version);
  }

  const total = tasks.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
  const start = (params.page - 1) * params.limit;
  const pageItems = tasks.slice(start, start + params.limit);

  return {
    data: pageItems.map(toPublicTask),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
    },
  };
}

/** All tasks assigned to a user (newest first), optionally filtered by dueDate window. */
export async function listTasksForAssignee(
  userId: string,
  from?: string,
  to?: string,
): Promise<Task[]> {
  const snapshot = await db
    .collection(TASKS_COLLECTION)
    .where("assigneeId", "==", userId)
    .get();

  let tasks: TaskDocument[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<TaskDocument, "id">),
  }));
  tasks.sort(
    (a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt),
  );
  tasks = filterByDateWindow(tasks, (t) => t.dueDate, from, to);
  return tasks.map(toPublicTask);
}

/** Update mutable task fields (ADMIN). projectId is immutable. */
export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const task = await getTaskDocumentById(id);

  // A completed task is read-only. The only permitted change is reopening it
  // (moving status away from DONE), which may carry other field edits with it.
  if (task.status === "DONE") {
    const reopening = input.status !== undefined && input.status !== "DONE";
    if (!reopening) {
      throw new ApiError(
        400,
        "Completed tasks are read-only. Reopen the task to edit it.",
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined)
    updates.description = input.description.trim();
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.status !== undefined) updates.status = input.status;
  if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
  if (input.version !== undefined) updates.version = input.version;

  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    // New assignee must also be a member of the task's project.
    if (!(await isProjectMember(task.projectId, input.assigneeId))) {
      throw new ApiError(
        400,
        "Assignee must already be assigned to the project",
      );
    }
    updates.assigneeId = input.assigneeId;
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await db.collection(TASKS_COLLECTION).doc(id).update(updates);

  const updated = await getTaskDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated task");
  }
  return toPublicTask(updated);
}

/** Update only a task's status (with an optional ON_HOLD reason). */
export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  reason?: string,
): Promise<Task> {
  await getTaskDocumentById(id);

  await db.collection(TASKS_COLLECTION).doc(id).update({
    status,
    // Record the reason when going ON_HOLD; clear it for any other status.
    onHoldReason:
      status === "ON_HOLD" && reason ? reason : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await getTaskDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated task");
  }
  return toPublicTask(updated);
}
