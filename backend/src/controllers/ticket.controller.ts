import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import {
  addTicketMessage,
  createTicket,
  getResponderIds,
  getTicketById,
  listAllTickets,
  listTicketMessages,
  listTicketsForUser,
  updateTicket,
} from "../services/ticket.service";
import type {
  CreateTicketInput,
  UpdateTicketInput,
} from "../services/ticket.service";
import { notify } from "../services/notification.service";
import type { TicketStatus } from "../types/ticket.types";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected ticket-controller error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

const isAdmin = (req: Request) => req.user!.role === UserRole.ADMIN;
const isHr = (req: Request) => req.user!.role === UserRole.HR;
const isStaff = (req: Request) => isAdmin(req) || isHr(req);

/**
 * Ensure the requester may see/act on this ticket: Admins on any ticket, HR only
 * on HR-team tickets, employees only on their own.
 */
async function assertTicketAccess(req: Request, id: string) {
  const ticket = await getTicketById(id);
  if (isAdmin(req)) return ticket;
  if (isHr(req)) {
    if (ticket.team !== "HR") {
      throw new ApiError(403, "This ticket is handled by another team");
    }
    return ticket;
  }
  if (ticket.createdBy !== req.user!.userId) {
    throw new ApiError(403, "You do not have access to this ticket");
  }
  return ticket;
}

/**
 * GET /tickets — Admin sees all; HR sees HR-team tickets; employees see their
 * own.
 */
export async function getTickets(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const status = (req.valid?.query as { status?: TicketStatus } | undefined)?.status;
    const data = isAdmin(req)
      ? await listAllTickets(status)
      : isHr(req)
        ? await listAllTickets(status, "HR")
        : await listTicketsForUser(req.user.userId, status);
    return res.status(200).json({ data });
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /tickets — any authenticated user raises a ticket (with a target team). */
export async function postTicket(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const input = req.valid?.body as Omit<CreateTicketInput, "createdBy">;
    const ticket = await createTicket({ ...input, createdBy: req.user.userId });
    // Notify the responders for this ticket's team (HR team → HR + admins;
    // SYSTEM → admins).
    const responders = await getResponderIds(ticket.team);
    await notify(
      responders,
      {
        type: "TICKET_UPDATE",
        title: "New help desk ticket",
        body: `${ticket.createdByName}: ${ticket.subject}`,
        ticketId: ticket.id,
      },
      req.user.userId,
    );
    return res.status(201).json(ticket);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /tickets/:id */
export async function getTicket(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const ticket = await assertTicketAccess(req, id);
    const messages = await listTicketMessages(id);
    return res.status(200).json({ ticket, messages });
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /tickets/:id — staff only; HR limited to HR-team, team reassign Admin-only. */
export async function patchTicket(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const before = await getTicketById(id);
    const input = req.valid?.body as UpdateTicketInput;

    // HR may only manage HR-team tickets.
    if (isHr(req) && before.team !== "HR") {
      return res
        .status(403)
        .json({ error: "This ticket is handled by another team" });
    }
    // Only an admin can move a ticket between teams.
    if (input.team !== undefined && !isAdmin(req)) {
      return res
        .status(403)
        .json({ error: "Only an admin can reassign a ticket to another team" });
    }

    const ticket = await updateTicket(id, input);
    if (input.status && input.status !== before.status) {
      await notify(
        [ticket.createdBy],
        {
          type: "TICKET_UPDATE",
          title: "Ticket updated",
          body: `"${ticket.subject}" is now ${ticket.status}.`,
          ticketId: ticket.id,
        },
        req.user.userId,
      );
    }
    return res.status(200).json(ticket);
  } catch (err) {
    return handleError(res, err);
  }
}

/** POST /tickets/:id/messages — owner or the ticket's responders may reply. */
export async function postTicketMessage(
  req: Request,
  res: Response,
): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const ticket = await assertTicketAccess(req, id);
    const { body } = req.valid?.body as { body: string };
    const message = await addTicketMessage(id, req.user.userId, body);
    // Notify the other party: owner ↔ the team's responders.
    const recipients = isStaff(req)
      ? [ticket.createdBy]
      : [ticket.assignedTo, ...(await getResponderIds(ticket.team))];
    await notify(
      recipients,
      {
        type: "TICKET_UPDATE",
        title: "New reply on a ticket",
        body: `${message.authorName} replied to "${ticket.subject}".`,
        ticketId: ticket.id,
      },
      req.user.userId,
    );
    return res.status(201).json(message);
  } catch (err) {
    return handleError(res, err);
  }
}
