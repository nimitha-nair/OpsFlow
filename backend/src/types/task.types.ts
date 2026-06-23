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

/** Internal representation of a task stored in Firestore. */
export interface TaskDocument {
  id: string;
  /** Human-readable code (TSK-001). Optional until backfilled. */
  code?: string;
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
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
  projectId: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  version?: string;
  onHoldReason?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
