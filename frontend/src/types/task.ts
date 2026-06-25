export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "ON_HOLD",
  "REVIEW",
  "DONE",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type AssignmentType = "INDIVIDUAL" | "MULTIPLE" | "DEPARTMENT";

/** Structured task assignment. `userIds` is always resolved (length >= 1). */
export interface TaskAssignment {
  type: AssignmentType;
  userIds: string[];
  /** Present ONLY when type === "DEPARTMENT". */
  department?: string;
}

export interface Task {
  id: string;
  /** Human-readable code (TSK-001). Absent on docs created before backfill. */
  code?: string;
  /** Owning project, or absent for a company-wide ("General") task. */
  projectId?: string;
  title: string;
  description: string;
  assignment: TaskAssignment;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  /** Target release/version label, for filtering and sorting. */
  version?: string;
  /** Reason captured when the task was put on hold. */
  onHoldReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TasksListResponse {
  data: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListTasksParams {
  projectId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Match any task whose assignment.userIds includes this user id. */
  assignee?: string;
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  version?: string;
  /** Which date the from/to window applies to. Defaults to dueDate. */
  basis?: "dueDate" | "createdAt";
}

/**
 * Discriminated assignment union sent in create/update payloads.
 * - INDIVIDUAL: exactly 1 userId.
 * - MULTIPLE: >= 2 userIds.
 * - DEPARTMENT: a department name; the server resolves userIds.
 */
export type AssignmentInput =
  | { type: "INDIVIDUAL"; userIds: [string] }
  | { type: "MULTIPLE"; userIds: string[] }
  | { type: "DEPARTMENT"; department: string };

export interface CreateTaskPayload {
  /** Omit for a company-wide ("General") task not tied to a project. */
  projectId?: string;
  title: string;
  description: string;
  assignment: AssignmentInput;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version?: string;
}

export type UpdateTaskPayload = Partial<Omit<CreateTaskPayload, "projectId">>;

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  REVIEW: "Review",
  DONE: "Done",
};
