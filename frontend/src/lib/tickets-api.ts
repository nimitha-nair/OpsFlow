import { api } from "./api";
import { apiErrorMessage } from "./users-api";
import type {
  Ticket,
  TicketCategory,
  TicketMessage,
  TicketPriority,
  TicketStatus,
  TicketTeam,
} from "../types/ticket";

/** GET /tickets?status= */
export async function listTickets(status?: TicketStatus): Promise<Ticket[]> {
  const { data } = await api.get<{ data: Ticket[] }>("/tickets", {
    params: status ? { status } : undefined,
  });
  return data.data;
}

/** POST /tickets */
export async function createTicket(payload: {
  subject: string;
  description: string;
  category: TicketCategory;
  team: TicketTeam;
  priority: TicketPriority;
}): Promise<Ticket> {
  const { data } = await api.post<Ticket>("/tickets", payload);
  return data;
}

/** GET /tickets/:id */
export async function getTicket(
  id: string,
): Promise<{ ticket: Ticket; messages: TicketMessage[] }> {
  const { data } = await api.get<{ ticket: Ticket; messages: TicketMessage[] }>(
    `/tickets/${id}`,
  );
  return data;
}

/** PATCH /tickets/:id (staff) */
export async function updateTicket(
  id: string,
  payload: {
    status?: TicketStatus;
    priority?: TicketPriority;
    team?: TicketTeam;
    assignedTo?: string;
  },
): Promise<Ticket> {
  const { data } = await api.patch<Ticket>(`/tickets/${id}`, payload);
  return data;
}

/** POST /tickets/:id/messages */
export async function addTicketMessage(
  id: string,
  body: string,
): Promise<TicketMessage> {
  const { data } = await api.post<TicketMessage>(`/tickets/${id}/messages`, {
    body,
  });
  return data;
}

export { apiErrorMessage };
