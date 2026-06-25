import type { Timestamp } from "firebase-admin/firestore";

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

export const ASSIGNMENT_TYPES = [
  "INDIVIDUAL",
  "MULTIPLE",
  "DEPARTMENT",
] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

/**
 * Structured task assignment. `userIds` is the resolved set of responsible
 * users and is ALWAYS length >= 1. `department` is present ONLY when
 * `type === "DEPARTMENT"` and carries the department label (e.g. "HR").
 */
export interface TaskAssignment {
  type: AssignmentType;
  userIds: string[];
  department?: string;
}

/** Internal representation of a task stored in Firestore. */
export interface TaskDocument {
  id: string;
  /** Human-readable code (TSK-001). Optional until backfilled. */
  code?: string;
  /** Owning project, or absent for a company-wide ("General") task. */
  projectId?: string;
  title: string;
  description: string;
  assignment: TaskAssignment;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  /** Target release/version label (e.g. "1.2.0"), for filtering and sorting. */
  version?: string;
  /** Reason captured when a task is moved to ON_HOLD. */
  onHoldReason?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing task; timestamps serialized as ISO-8601 strings. */
export interface Task {
  id: string;
  code?: string;
  /** Owning project, or absent for a company-wide ("General") task. */
  projectId?: string;
  title: string;
  description: string;
  assignment: TaskAssignment;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version?: string;
  onHoldReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
