import { z } from "zod";

import { dateRangeQuery, firestoreId } from "./common";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TEAMS,
} from "../types/ticket.types";

/** POST /tickets */
export const createTicketBody = z
  .object({
    subject: z.string().trim().min(1).max(140),
    description: z.string().trim().min(1).max(4000),
    category: z.enum(TICKET_CATEGORIES).default("QUESTION"),
    team: z.enum(TICKET_TEAMS).default("SYSTEM"),
    priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
  })
  .strict();

/** PATCH /tickets/:id — staff: status / priority / team / assignment. */
export const updateTicketBody = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    priority: z.enum(TICKET_PRIORITIES).optional(),
    team: z.enum(TICKET_TEAMS).optional(),
    assignedTo: firestoreId.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update",
  });

/** POST /tickets/:id/messages */
export const createTicketMessageBody = z
  .object({ body: z.string().trim().min(1).max(4000) })
  .strict();

/** GET /tickets?status=&from=&to= */
export const listTicketsQuery = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
  })
  .merge(dateRangeQuery);

export const ticketIdParams = z.object({ id: firestoreId });
