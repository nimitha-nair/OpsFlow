import type { Timestamp } from "firebase-admin/firestore";

export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_CATEGORIES = ["QUESTION", "ISSUE", "REQUEST"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/**
 * Which team owns/resolves the ticket. HR handles people/policy/payroll
 * requests; SYSTEM (Admin) handles platform/IT/project issues. Drives routing,
 * visibility and notifications.
 */
export const TICKET_TEAMS = ["HR", "SYSTEM"] as const;
export type TicketTeam = (typeof TICKET_TEAMS)[number];

/** A help-desk ticket (collection: tickets). */
export interface TicketDocument {
  id: string;
  code?: string;
  subject: string;
  description: string;
  category: TicketCategory;
  /** Owning team; legacy tickets without one are treated as SYSTEM. */
  team: TicketTeam;
  priority: TicketPriority;
  status: TicketStatus;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Ticket {
  id: string;
  code?: string;
  subject: string;
  description: string;
  category: TicketCategory;
  /** Owning team; legacy tickets without one are treated as SYSTEM. */
  team: TicketTeam;
  priority: TicketPriority;
  status: TicketStatus;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedToName?: string;
  createdAt: string;
  updatedAt: string;
}

/** A reply on a ticket (collection: ticketMessages). */
export interface TicketMessageDocument {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Timestamp;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}
