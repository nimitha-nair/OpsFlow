import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import {
  createTaskBody,
  listTasksQuery,
  taskStatusBody,
  updateTaskBody,
} from "../validation/task.schema";
import UserRole from "../types/roles";
import {
  getMyTasks,
  getTask,
  getTasks,
  patchTask,
  patchTaskStatus,
  postTask,
} from "../controllers/task.controller";

const router = Router();

// ADMIN only — create.
router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createTaskBody }),
  postTask,
);

// ADMIN + HR — view (filterable).
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ query: listTasksQuery }),
  getTasks,
);

// Any authenticated user — only tasks assigned to them.
// Registered before "/:id" so "my-tasks" is not captured as an id.
router.get(
  "/my-tasks",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  getMyTasks,
);

// ADMIN + HR (any task) and EMPLOYEE (only assigned tasks, checked in handler).
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getTask,
);

// ADMIN only — full edit.
router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams, body: updateTaskBody }),
  patchTask,
);

// ADMIN (any) and EMPLOYEE (own tasks) — status only. HR cannot modify.
router.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.EMPLOYEE),
  validate({ params: idParams, body: taskStatusBody }),
  patchTaskStatus,
);

export default router;
