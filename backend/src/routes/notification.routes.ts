import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import UserRole from "../types/roles";
import {
  getNotifications,
  patchAllRead,
  patchNotificationRead,
} from "../controllers/notification.controller";

const router = Router();

const anyRole = authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE);

// List the authenticated user's notifications.
router.get("/", authenticate, anyRole, getNotifications);

// Mark all read — registered before "/:id/read" (distinct segment count anyway).
router.patch("/read-all", authenticate, anyRole, patchAllRead);

// Mark one read.
router.patch(
  "/:id/read",
  authenticate,
  anyRole,
  validate({ params: idParams }),
  patchNotificationRead,
);

export default router;
