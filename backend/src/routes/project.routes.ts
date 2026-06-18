import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import {
  createProjectBody,
  listProjectsQuery,
  updateProjectBody,
} from "../validation/project.schema";
import {
  assignMemberBody,
  memberParams,
  projectIdParams,
} from "../validation/projectMember.schema";
import UserRole from "../types/roles";
import {
  getMyProjects,
  getProject,
  getProjects,
  patchArchiveProject,
  patchProject,
  patchUnarchiveProject,
  postProject,
} from "../controllers/project.controller";
import {
  deleteMember,
  getMembers,
  postMember,
} from "../controllers/projectMember.controller";

const router = Router();

// ADMIN + HR — view all (budget hidden for HR).
router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR),
  validate({ query: listProjectsQuery }),
  getProjects,
);

// Any authenticated user — only the projects they are assigned to.
// Registered before "/:id" so "my-projects" is not captured as an id.
router.get(
  "/my-projects",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  getMyProjects,
);

// ADMIN + HR (any project) and EMPLOYEE (only assigned projects, checked in the
// controller). Budget hidden for non-ADMIN roles.
router.get(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getProject,
);

// ADMIN only — create and edit.
router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ body: createProjectBody }),
  postProject,
);
router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams, body: updateProjectBody }),
  patchProject,
);

// ADMIN only — archive (make read-only) / restore.
router.patch(
  "/:id/archive",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams }),
  patchArchiveProject,
);
router.patch(
  "/:id/unarchive",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: idParams }),
  patchUnarchiveProject,
);

// --- Project membership (employee assignment) ---

// ADMIN, HR, or a member EMPLOYEE — view the team (membership re-checked
// in the controller for EMPLOYEE callers).
router.get(
  "/:projectId/members",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: projectIdParams }),
  getMembers,
);

// ADMIN only — assign an employee.
router.post(
  "/:projectId/members",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: projectIdParams, body: assignMemberBody }),
  postMember,
);

// ADMIN only — remove an employee.
router.delete(
  "/:projectId/members/:userId",
  authenticate,
  authorize(UserRole.ADMIN),
  validate({ params: memberParams }),
  deleteMember,
);

export default router;
