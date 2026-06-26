import { Router } from "express";

import { askHelp } from "../controllers/help.controller";
import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import UserRole from "../types/roles";
import { askHelpBody } from "../validation/help.schema";

const router = Router();

const anyRole = authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE);

// Ask the user manual a question — answer is grounded on the caller's
// role-scoped manual content (role taken from the JWT, not the body).
router.post(
  "/ask",
  authenticate,
  anyRole,
  validate({ body: askHelpBody }),
  askHelp,
);

export default router;
