import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { listActivityQuery } from "../validation/activity.schema";
import UserRole from "../types/roles";
import { getActivity } from "../controllers/activity.controller";

const router = Router();

// Activity timeline — any authenticated user; scope decided in the handler.
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ query: listActivityQuery }),
  getActivity,
);

export default router;
