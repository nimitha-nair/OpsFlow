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
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });

/** PATCH /tasks/:id/status */
export const taskStatusBody = z
  .object({ status: statusSchema })
  .strict();

/** GET /tasks */
export const listTasksQuery = z.object({
  page: pageQuery,
  limit: limitQuery,
  projectId: firestoreId.optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  assigneeId: firestoreId.optional(),
});
