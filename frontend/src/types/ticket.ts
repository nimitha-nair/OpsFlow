export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "RESOLVED",
  "CLOSED",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const TICKET_CATEGORIES = ["QUESTION", "ISSUE", "REQUEST"] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  QUESTION: "Question",
  ISSUE: "Issue",
  REQUEST: "Request",
};

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

/** Which team owns/resolves the ticket. */
export const TICKET_TEAMS = ["HR", "SYSTEM"] as const;
export type TicketTeam = (typeof TICKET_TEAMS)[number];
export const TICKET_TEAM_LABELS: Record<TicketTeam, string> = {
  HR: "HR — People & Policy",
  SYSTEM: "IT — Systems & Projects",
};
/** Short labels for dense table/badge contexts. */
export const TICKET_TEAM_SHORT: Record<TicketTeam, string> = {
  HR: "HR",
  SYSTEM: "IT/Systems",
};

export interface Ticket {
  id: string;
  code?: string;
  subject: string;
  description: string;
  category: TicketCategory;
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

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}
