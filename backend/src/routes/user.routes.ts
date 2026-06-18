import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import {
  createUserBody,
  listUsersQuery,
  updateUserBody,
  userStatusBody,
} from "../validation/user.schema";
import UserRole from "../types/roles";
import {
  getMe,
  getUser,
  getUsers,
  patchUser,
  patchUserStatus,
  postUser,
} from "../controllers/user.controller";

const router = Router();

// Any authenticated user — own profile.
// Registered before "/:id" so "me" is not captured as an id.
router.get("/me", authenticate, getMe);

// ADMIN + HR — list and read.
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ query: listUsersQuery }),
  getUsers,
);
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ params: idParams }),
  getUser,
);

// ADMIN only — create, update, change status.
router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createUserBody }),
  postUser,
);
router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams, body: updateUserBody }),
  patchUser,
);
router.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams, body: userStatusBody }),
  patchUserStatus,
);

export default router;
