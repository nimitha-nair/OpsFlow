import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { filterByDateWindow } from "../utils/date-window";
import type {
  Task,
  TaskAssignment,
  TaskDocument,
  TaskPriority,
  TaskStatus,
} from "../types/task.types";
import type { AssignmentInput } from "../validation/task.schema";
import { assertProjectNotArchived, getProjectById } from "./project.service";
import { isProjectMember } from "./projectMember.service";
import { generateCode } from "./code-generator";
import { getUserById } from "./user.service";

const TASKS_COLLECTION = "tasks";

export interface CreateTaskInput {
  /** Owning project, or omitted for a company-wide ("General") task. */
  projectId?: string;
  title: string;
  description: string;
  assignment: AssignmentInput;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version?: string;
  createdBy: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  assignment?: AssignmentInput;
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
  /** Keep tasks where this user is in `assignment.userIds`. */
  assignee?: string;
  from?: string;
  to?: string;
  version?: string;
  /** Which date the from/to window applies to. Defaults to dueDate. */
  basis?: "dueDate" | "createdAt";
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
  // Legacy docs (pre-assignment migration / not yet backfilled) may lack
  // `assignment`; synthesize it from the old single `assigneeId` so the API
  // always returns a valid shape and clients never read `undefined.userIds`.
  const legacyAssigneeId = (task as { assigneeId?: string }).assigneeId;
  const assignment: TaskAssignment = task.assignment ?? {
    type: "INDIVIDUAL",
    userIds:
      typeof legacyAssigneeId === "string" && legacyAssigneeId.length > 0
        ? [legacyAssigneeId]
        : [],
  };
  return {
    id: task.id,
    ...(task.code !== undefined ? { code: task.code } : {}),
    ...(task.projectId !== undefined ? { projectId: task.projectId } : {}),
    title: task.title,
    description: task.description,
    assignment,
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

/**
 * Whether a user is responsible for a task: directly in `assignment.userIds`,
 * or via a DEPARTMENT assignment matching their own department. Used to scope
 * non-admin access (employees and HR) to their own work.
 */
export async function isUserResponsibleForTask(
  task: Task,
  userId: string,
): Promise<boolean> {
  if (task.assignment?.userIds?.includes(userId)) return true;
  if (task.assignment?.type === "DEPARTMENT" && task.assignment.department) {
    const user = await getUserById(userId);
    return user.department?.trim() === task.assignment.department;
  }
  return false;
}

/** Delete a task. Throws 404 if it does not exist. */
export async function deleteTask(id: string): Promise<void> {
  const task = await getTaskDocById(id);
  if (!task) {
    throw new ApiError(404, "Task not found");
  }
  await db.collection(TASKS_COLLECTION).doc(id).delete();
}

/**
 * Resolve a validated assignment request into a concrete `TaskAssignment`
 * (always with `userIds.length >= 1`). Scope depends on whether the task has a
 * project:
 * - With a project: assignees must be project members; DEPARTMENT resolves to
 *   the project members in that department.
 * - Company-wide (no project): assignees must be active users; DEPARTMENT
 *   resolves to ALL active users in that department — so e.g. HR can be
 *   targeted even though HR users aren't on any project.
 * Empty DEPARTMENT resolution → 400.
 */
async function resolveAssignment(
  projectId: string | undefined,
  input: AssignmentInput,
): Promise<TaskAssignment> {
  // A project, when given, must exist (reuses Projects CRUD; 404 otherwise).
  if (projectId) await getProjectById(projectId);

  // Eligibility: project membership when scoped to a project, else "active user".
  const isEligible = async (userId: string): Promise<boolean> => {
    if (projectId) return isProjectMember(projectId, userId);
    try {
      const user = await getUserById(userId);
      return user.isActive !== false;
    } catch {
      return false;
    }
  };

  if (input.type === "DEPARTMENT") {
    const target = input.department.trim().toLowerCase();
    const usersSnap = await db.collection("users").get();
    const userIds: string[] = [];
    for (const doc of usersSnap.docs) {
      const dept = (doc.get("department") as string | undefined)?.trim();
      if (!dept || dept.toLowerCase() !== target) continue;
      if (doc.get("isActive") === false) continue;
      if (projectId && !(await isProjectMember(projectId, doc.id))) continue;
      userIds.push(doc.id);
    }
    if (userIds.length === 0) {
      throw new ApiError(
        400,
        projectId
          ? "No project members found in that department"
          : "No active users found in that department",
      );
    }
    return { type: "DEPARTMENT", userIds, department: input.department.trim() };
  }

  // INDIVIDUAL / MULTIPLE: every id must be eligible. De-dupe defensively.
  const userIds = [...new Set(input.userIds)];
  const eligibility = await Promise.all(userIds.map(isEligible));
  if (eligibility.some((ok) => !ok)) {
    throw new ApiError(
      400,
      projectId
        ? "All assignees must be members of the project"
        : "All assignees must be valid, active users",
    );
  }
  return { type: input.type, userIds };
}

/**
 * Create a task. If a project is given it must be active and assignees must be
 * its members; without a project (company-wide) assignees are validated as
 * active users. The assignment is resolved to a concrete user set.
 */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  if (input.projectId) await assertProjectNotArchived(input.projectId);
  const assignment = await resolveAssignment(input.projectId, input.assignment);

  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(TASKS_COLLECTION).add({
    code: await generateCode("task"),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    title: input.title.trim(),
    description: input.description.trim(),
    assignment,
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
  if (params.assignee !== undefined) {
    const assignee = params.assignee;
    tasks = tasks.filter((t) => t.assignment?.userIds?.includes(assignee));
  }
  tasks = filterByDateWindow(
    tasks,
    (t) => (params.basis === "createdAt" ? t.createdAt : t.dueDate),
    params.from,
    params.to,
  );
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

/**
 * All tasks a user is responsible for (newest first), optionally filtered by a
 * dueDate window. Includes tasks where the user is in `assignment.userIds` and
 * DEPARTMENT-assigned tasks targeting the user's own department.
 */
export async function listTasksForAssignee(
  userId: string,
  from?: string,
  to?: string,
): Promise<Task[]> {
  // The user's department drives the second (DEPARTMENT) query.
  const user = await getUserById(userId);
  const dept = user.department?.trim();

  const queries = [
    db
      .collection(TASKS_COLLECTION)
      .where("assignment.userIds", "array-contains", userId)
      .get(),
    // Legacy fallback: un-migrated tasks still carry a single `assigneeId`
    // (no `assignment.userIds`), so match those too until the backfill runs.
    db.collection(TASKS_COLLECTION).where("assigneeId", "==", userId).get(),
  ];
  if (dept) {
    queries.push(
      db
        .collection(TASKS_COLLECTION)
        .where("assignment.department", "==", dept)
        .get(),
    );
  }

  const snapshots = await Promise.all(queries);
  const byId = new Map<string, TaskDocument>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      byId.set(doc.id, {
        id: doc.id,
        ...(doc.data() as Omit<TaskDocument, "id">),
      });
    }
  }

  let tasks = [...byId.values()];
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

  if (input.assignment !== undefined) {
    const resolved = await resolveAssignment(task.projectId, input.assignment);
    const before = new Set(task.assignment?.userIds ?? []);
    const after = new Set(resolved.userIds);
    const sameUsers =
      before.size === after.size &&
      [...after].every((id) => before.has(id));
    // Only write when the responsible set actually changed (drives the
    // reassignment notification in the controller).
    if (!sameUsers || resolved.type !== task.assignment?.type) {
      updates.assignment = resolved;
    }
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
