import { z } from "zod";

import {
  dateString,
  firestoreId,
  limitQuery,
  pageQuery,
} from "./common";
import { TASK_PRIORITIES, TASK_STATUSES } from "../types/task.types";

const prioritySchema = z.enum(TASK_PRIORITIES);
const statusSchema = z.enum(TASK_STATUSES);

/** POST /tasks */
export const createTaskBody = z
  .object({
    projectId: firestoreId,
    title: z.string().trim().min(1),
    // Optional — title/project/assignee/priority/due date carry the requirement.
    description: z.string().trim().max(2000).optional().default(""),
    assigneeId: firestoreId,
    priority: prioritySchema.default("MEDIUM"),
    status: statusSchema.default("TODO"),
    dueDate: dateString,
    version: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .strict();

/** PATCH /tasks/:id (ADMIN — full edit, projectId is immutable) */
export const updateTaskBody = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().max(2000).optional(),
    assigneeId: firestoreId.optional(),
    priority: prioritySchema.optional(),
    status: statusSchema.optional(),
    dueDate: dateString.optional(),
    version: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });

/** PATCH /tasks/:id/status — `reason` is required when moving to ON_HOLD. */
export const taskStatusBody = z
  .object({
    status: statusSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((v) => v.status !== "ON_HOLD" || (v.reason && v.reason.length > 0), {
    message: "A reason is required to put a task on hold",
    path: ["reason"],
  });

/** GET /tasks */
export const listTasksQuery = z.object({
  page: pageQuery,
  limit: limitQuery,
  projectId: firestoreId.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assigneeId: firestoreId.optional(),
});
