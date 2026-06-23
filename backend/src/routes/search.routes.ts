import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { searchQuery } from "../validation/search.schema";
import UserRole from "../types/roles";
import { getSearch } from "../controllers/search.controller";

const router = Router();

// Cross-entity search — any authenticated user; results scoped by role.
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ query: searchQuery }),
  getSearch,
);

export default router;
