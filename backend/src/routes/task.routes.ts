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
import {
  attachmentParams,
  commentParams,
  createCommentBody,
  taskIdParams,
} from "../validation/comment.schema";
import { uploadTaskFile } from "../middleware/task-upload";
import UserRole from "../types/roles";
import {
  deleteTaskHandler,
  getMyTasks,
  getTask,
  getTasks,
  patchTask,
  patchTaskStatus,
  postTask,
} from "../controllers/task.controller";
import {
  deleteCommentHandler,
  getComments,
  postComment,
} from "../controllers/comment.controller";
import {
  deleteAttachmentHandler,
  getAttachmentFile,
  getAttachments,
  postAttachment,
} from "../controllers/task-attachment.controller";

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

// ADMIN only — delete.
router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams }),
  deleteTaskHandler,
);

// Comments — any authenticated user with access to the task (checked in handler).
router.get(
  "/:taskId/comments",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: taskIdParams }),
  getComments,
);
router.post(
  "/:taskId/comments",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: taskIdParams, body: createCommentBody }),
  postComment,
);
router.delete(
  "/:taskId/comments/:commentId",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: commentParams }),
  deleteCommentHandler,
);

// Attachments — any authenticated user with access to the task.
const anyTaskRole = authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE);
router.get(
  "/:taskId/attachments",
  authenticate,
  anyTaskRole,
  validate({ params: taskIdParams }),
  getAttachments,
);
router.post(
  "/:taskId/attachments",
  authenticate,
  anyTaskRole,
  validate({ params: taskIdParams }),
  uploadTaskFile,
  postAttachment,
);
router.get(
  "/:taskId/attachments/:attachmentId/file",
  authenticate,
  anyTaskRole,
  validate({ params: attachmentParams }),
  getAttachmentFile,
);
router.delete(
  "/:taskId/attachments/:attachmentId",
  authenticate,
  anyTaskRole,
  validate({ params: attachmentParams }),
  deleteAttachmentHandler,
);

export default router;
