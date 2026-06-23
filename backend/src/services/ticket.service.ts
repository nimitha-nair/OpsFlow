import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { generateCode } from "./code-generator";
import type {
  Ticket,
  TicketCategory,
  TicketDocument,
  TicketMessage,
  TicketMessageDocument,
  TicketPriority,
  TicketStatus,
  TicketTeam,
} from "../types/ticket.types";

const TICKETS_COLLECTION = "tickets";
const MESSAGES_COLLECTION = "ticketMessages";

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}
function tsMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function toPublicTicket(t: TicketDocument): Ticket {
  const result: Ticket = {
    id: t.id,
    subject: t.subject,
    description: t.description,
    category: t.category,
    // Legacy tickets created before team routing default to SYSTEM (Admin).
    team: t.team ?? "SYSTEM",
    priority: t.priority,
    status: t.status,
    createdBy: t.createdBy,
    createdByName: t.createdByName,
    createdAt: tsIso(t.createdAt),
    updatedAt: tsIso(t.updatedAt),
  };
  if (t.code !== undefined) result.code = t.code;
  if (t.assignedTo !== undefined) result.assignedTo = t.assignedTo;
  if (t.assignedToName !== undefined) result.assignedToName = t.assignedToName;
  return result;
}

function toPublicMessage(m: TicketMessageDocument): TicketMessage {
  return {
    id: m.id,
    ticketId: m.ticketId,
    authorId: m.authorId,
    authorName: m.authorName,
    body: m.body,
    createdAt: tsIso(m.createdAt),
  };
}

async function userName(id: string): Promise<string> {
  const snap = await db.collection("users").doc(id).get();
  return (snap.data()?.name as string | undefined) ?? "Unknown";
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  category: TicketCategory;
  team: TicketTeam;
  priority: TicketPriority;
  createdBy: string;
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(TICKETS_COLLECTION).add({
    code: await generateCode("ticket"),
    subject: input.subject.trim(),
    description: input.description.trim(),
    category: input.category,
    team: input.team,
    priority: input.priority,
    status: "OPEN" as TicketStatus,
    createdBy: input.createdBy,
    createdByName: await userName(input.createdBy),
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  return toPublicTicket({
    id: ref.id,
    ...(snap.data() as Omit<TicketDocument, "id">),
  });
}

function sortAndMap(
  docs: TicketDocument[],
  status?: TicketStatus,
  team?: TicketTeam,
): Ticket[] {
  let rows = docs;
  if (status) rows = rows.filter((t) => t.status === status);
  // Legacy tickets without a team are treated as SYSTEM (Admin) for routing.
  if (team) rows = rows.filter((t) => (t.team ?? "SYSTEM") === team);
  rows.sort((a, b) => tsMillis(b.updatedAt) - tsMillis(a.updatedAt));
  return rows.map(toPublicTicket);
}

/**
 * All tickets, newest activity first. ADMIN passes no team (sees everything);
 * HR passes team="HR" to see only people/policy tickets.
 */
export async function listAllTickets(
  status?: TicketStatus,
  team?: TicketTeam,
): Promise<Ticket[]> {
  const snap = await db.collection(TICKETS_COLLECTION).get();
  return sortAndMap(
    snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TicketDocument, "id">) })),
    status,
    team,
  );
}

/** Tickets raised by a specific user. */
export async function listTicketsForUser(
  userId: string,
  status?: TicketStatus,
): Promise<Ticket[]> {
  const snap = await db
    .collection(TICKETS_COLLECTION)
    .where("createdBy", "==", userId)
    .get();
  return sortAndMap(
    snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TicketDocument, "id">) })),
    status,
  );
}

async function getTicketDoc(id: string): Promise<TicketDocument> {
  const snap = await db.collection(TICKETS_COLLECTION).doc(id).get();
  if (!snap.exists) throw new ApiError(404, "Ticket not found");
  return { id: snap.id, ...(snap.data() as Omit<TicketDocument, "id">) };
}

export async function getTicketById(id: string): Promise<Ticket> {
  return toPublicTicket(await getTicketDoc(id));
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  team?: TicketTeam;
  assignedTo?: string;
}

export async function updateTicket(
  id: string,
  input: UpdateTicketInput,
): Promise<Ticket> {
  await getTicketDoc(id);
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.status !== undefined) updates.status = input.status;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.team !== undefined) updates.team = input.team;
  if (input.assignedTo !== undefined) {
    updates.assignedTo = input.assignedTo;
    const u = await db.collection("users").doc(input.assignedTo).get();
    updates.assignedToName = (u.data()?.name as string | undefined) ?? "Unknown";
  }
  await db.collection(TICKETS_COLLECTION).doc(id).update(updates);
  return toPublicTicket(await getTicketDoc(id));
}

/** List a ticket's messages, oldest first. */
export async function listTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const snap = await db
    .collection(MESSAGES_COLLECTION)
    .where("ticketId", "==", ticketId)
    .get();
  const rows: TicketMessageDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<TicketMessageDocument, "id">),
  }));
  rows.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
  return rows.map(toPublicMessage);
}

/** Add a message; bumps the ticket's updatedAt. */
export async function addTicketMessage(
  ticketId: string,
  authorId: string,
  body: string,
): Promise<TicketMessage> {
  await getTicketDoc(ticketId); // 404 if absent
  const now = FieldValue.serverTimestamp();
  const ref = await db.collection(MESSAGES_COLLECTION).add({
    ticketId,
    authorId,
    authorName: await userName(authorId),
    body: body.trim(),
    createdAt: now,
  });
  await db.collection(TICKETS_COLLECTION).doc(ticketId).update({ updatedAt: now });
  const snap = await ref.get();
  return toPublicMessage({
    id: ref.id,
    ...(snap.data() as Omit<TicketMessageDocument, "id">),
  });
}

/** Ids of ADMIN/HR staff (help-desk responders). */
export async function getStaffIds(): Promise<string[]> {
  const snap = await db.collection("users").get();
  return snap.docs
    .filter((d) => {
      const role = d.get("role") as string | undefined;
      return role === "ADMIN" || role === "HR";
    })
    .map((d) => d.id);
}

/**
 * Ids of the people who should respond to a ticket on a given team. Admins
 * oversee every team; HR is notified only for HR-team tickets.
 */
export async function getResponderIds(team: TicketTeam): Promise<string[]> {
  const snap = await db.collection("users").get();
  return snap.docs
    .filter((d) => {
      const role = d.get("role") as string | undefined;
      if (role === "ADMIN") return true;
      if (role === "HR") return team === "HR";
      return false;
    })
    .map((d) => d.id);
}
