import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import UserRole from "../types/roles";

/**
 * Example routes demonstrating role-based access control.
 * All routes first run `authenticate` (valid JWT required), then `authorize`
 * restricts access by role.
 */
const router = Router();

// ADMIN only.
router.get(
  "/admin-only",
  authenticate,
  authorize(UserRole.ADMIN),
  (req, res) => {
    res.json({ message: "Welcome, admin.", user: req.user });
  },
);

// ADMIN or HR.
router.get(
  "/staff",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  (req, res) => {
    res.json({ message: "Welcome, staff member.", user: req.user });
  },
);

// Any authenticated user (no role restriction).
router.get("/me", authenticate, (req, res) => {
  res.json({ message: "Authenticated.", user: req.user });
});

export default router;
