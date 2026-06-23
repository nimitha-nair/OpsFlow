import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware";
import { authorize } from "../middleware/rbac.middleware";
import { validate } from "../middleware/validate";
import { idParams } from "../validation/common";
import {
  createTicketBody,
  createTicketMessageBody,
  listTicketsQuery,
  updateTicketBody,
} from "../validation/ticket.schema";
import UserRole from "../types/roles";
import {
  getTicket,
  getTickets,
  patchTicket,
  postTicket,
  postTicketMessage,
} from "../controllers/ticket.controller";

const router = Router();

const anyRole = authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE);
const staff = authorize(UserRole.ADMIN, UserRole.HR);

// List — staff see all, employees see their own (decided in handler).
router.get("/", authenticate, anyRole, validate({ query: listTicketsQuery }), getTickets);

// Raise a ticket.
router.post("/", authenticate, anyRole, validate({ body: createTicketBody }), postTicket);

// View one (access checked in handler) + its messages.
router.get("/:id", authenticate, anyRole, validate({ params: idParams }), getTicket);

// Manage (status / priority / assignment) — staff only.
router.patch(
  "/:id",
  authenticate,
  staff,
  validate({ params: idParams, body: updateTicketBody }),
  patchTicket,
);

// Reply — owner or staff.
router.post(
  "/:id/messages",
  authenticate,
  anyRole,
  validate({ params: idParams, body: createTicketMessageBody }),
  postTicketMessage,
);

export default router;
