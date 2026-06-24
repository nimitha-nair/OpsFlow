import { Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { filterByDateWindow } from "../utils/date-window";
import type { ActivityEntity, ActivityEvent } from "../types/activity.types";

/** ISO string for a Firestore Timestamp; epoch for anything unexpected. */
function tsIso(value: unknown): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}
function tsMillis(value: unknown): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

/** "IN_PROGRESS" -> "In Progress" for human-readable descriptions. */
function humanize(token: string): string {
  return token
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** A meaningful update happened after creation (more than a second apart). */
function wasUpdated(createdAt: unknown, updatedAt: unknown): boolean {
  return tsMillis(updatedAt) - tsMillis(createdAt) > 1000;
}

interface EventInput {
  entity: ActivityEntity;
  entityId: string;
  verb: string;
  title: string;
  timestamp: string;
  // Allow explicit `undefined` so callers can pass through optional fields;
  // buildEvent() strips any that are undefined before constructing the event.
  code?: string | undefined;
  description?: string | undefined;
  actorId?: string | undefined;
  actorName?: string | undefined;
}

/**
 * Build an ActivityEvent, omitting optional fields that are undefined (the
 * project uses exactOptionalPropertyTypes). The id is `entity:id:verb`.
 */
function buildEvent(e: EventInput): ActivityEvent {
  const ev: ActivityEvent = {
    id: `${e.entity}:${e.entityId}:${e.verb}`,
    entity: e.entity,
    entityId: e.entityId,
    verb: e.verb,
    title: e.title,
    timestamp: e.timestamp,
  };
  if (e.code !== undefined) ev.code = e.code;
  if (e.description !== undefined) ev.description = e.description;
  if (e.actorId !== undefined) ev.actorId = e.actorId;
  if (e.actorName !== undefined) ev.actorName = e.actorName;
  return ev;
}

export interface ListActivityParams {
  /** When set, restrict to events this user owns (employee view). */
  scopeUserId?: string;
  /**
   * HR audience: a compliance-focused feed — expenses (incl. approvals) and
   * tickets only. Excludes task, team-member and project activity (which is
   * Admin-only org-wide context). Ignored when `scopeUserId` is set.
   */
  hrOnly?: boolean;
  /** Max events to return after merging/sorting. Default 40. */
  limit?: number;
  /** Inclusive ISO lower bound for event `timestamp`. */
  from?: string;
  /** Inclusive ISO upper bound for event `timestamp`. */
  to?: string;
}

/**
 * Build a unified, newest-first activity timeline derived from existing
 * collections. Staff (no scope) see organization-wide activity; passing
 * `scopeUserId` restricts to a single user's own tickets/tasks/expenses.
 */
export async function listActivity(
  params: ListActivityParams = {},
): Promise<ActivityEvent[]> {
  const { scopeUserId, hrOnly = false, limit = 40, from, to } = params;
  const events: ActivityEvent[] = [];

  // Resolve display names once (tasks/expenses store ids, not names).
  const usersSnap = await db.collection("users").get();
  const nameById = new Map<string, string>();
  for (const d of usersSnap.docs) {
    nameById.set(d.id, (d.get("name") as string | undefined) ?? "Unknown");
  }
  const nameOf = (id?: string) => (id ? nameById.get(id) ?? "Unknown" : undefined);

  // --- Tickets ---------------------------------------------------------------
  const ticketsSnap = await db.collection("tickets").get();
  for (const d of ticketsSnap.docs) {
    const t = d.data();
    if (scopeUserId && t.createdBy !== scopeUserId) continue;
    const code = t.code as string | undefined;
    const subject = (t.subject as string | undefined) ?? "Ticket";
    events.push(
      buildEvent({
        entity: "ticket",
        entityId: d.id,
        verb: "created",
        title: "Ticket opened",
        description: subject,
        code,
        actorId: t.createdBy as string | undefined,
        actorName: (t.createdByName as string | undefined) ?? nameOf(t.createdBy as string),
        timestamp: tsIso(t.createdAt),
      }),
    );
    if (wasUpdated(t.createdAt, t.updatedAt)) {
      events.push(
        buildEvent({
          entity: "ticket",
          entityId: d.id,
          verb: "updated",
          title: "Ticket updated",
          description: `${subject} · now ${humanize((t.status as string) ?? "")}`,
          code,
          timestamp: tsIso(t.updatedAt),
        }),
      );
    }
  }

  // --- Tasks (Admin org-wide + employee-own; not in the HR compliance feed) --
  if (!hrOnly) {
    const tasksSnap = await db.collection("tasks").get();
    for (const d of tasksSnap.docs) {
    const t = d.data();
    if (
      scopeUserId &&
      t.assigneeId !== scopeUserId &&
      t.createdBy !== scopeUserId
    )
      continue;
    const code = t.code as string | undefined;
    const title = (t.title as string | undefined) ?? "Task";
    events.push(
      buildEvent({
        entity: "task",
        entityId: d.id,
        verb: "created",
        title: "Task created",
        description: title,
        code,
        actorId: t.createdBy as string | undefined,
        actorName: nameOf(t.createdBy as string),
        timestamp: tsIso(t.createdAt),
      }),
    );
    if (wasUpdated(t.createdAt, t.updatedAt)) {
      events.push(
        buildEvent({
          entity: "task",
          entityId: d.id,
          verb: "updated",
          title: "Task updated",
          description: `${title} · now ${humanize((t.status as string) ?? "")}`,
          code,
          actorName: nameOf(t.assigneeId as string),
          timestamp: tsIso(t.updatedAt),
        }),
      );
    }
    }
  }

  // --- Expenses --------------------------------------------------------------
  const expensesSnap = await db.collection("expenses").get();
  for (const d of expensesSnap.docs) {
    const e = d.data();
    if (scopeUserId && e.employeeId !== scopeUserId) continue;
    const code = e.code as string | undefined;
    const amount = e.amount as number | undefined;
    const currency = (e.currency as string | undefined) ?? "";
    const money =
      amount !== undefined ? `${currency} ${amount}`.trim() : undefined;
    events.push(
      buildEvent({
        entity: "expense",
        entityId: d.id,
        verb: "created",
        title: "Expense submitted",
        description: money ?? humanize((e.category as string) ?? "Expense"),
        code,
        actorId: e.employeeId as string | undefined,
        actorName: nameOf(e.employeeId as string),
        timestamp: tsIso(e.createdAt),
      }),
    );
    const status = e.approvalStatus as string | undefined;
    if (
      (status === "APPROVED" || status === "REJECTED") &&
      wasUpdated(e.createdAt, e.updatedAt)
    ) {
      events.push(
        buildEvent({
          entity: "expense",
          entityId: d.id,
          verb: "reviewed",
          title: `Expense ${humanize(status)}`,
          code,
          description: money,
          actorName: e.reviewedByName as string | undefined,
          timestamp: tsIso(e.updatedAt),
        }),
      );
    }
  }

  // --- Users & projects (Admin org-wide only; excluded from HR + employee) ---
  if (!scopeUserId && !hrOnly) {
    for (const d of usersSnap.docs) {
      const u = d.data();
      events.push(
        buildEvent({
          entity: "user",
          entityId: d.id,
          verb: "joined",
          title: "Team member added",
          description: `${(u.name as string | undefined) ?? "Someone"} · ${humanize((u.role as string) ?? "")}`,
          actorName: u.name as string | undefined,
          timestamp: tsIso(u.createdAt),
        }),
      );
    }
    const projectsSnap = await db.collection("projects").get();
    for (const d of projectsSnap.docs) {
      const p = d.data();
      events.push(
        buildEvent({
          entity: "project",
          entityId: d.id,
          verb: "created",
          title: "Project created",
          description: p.name as string | undefined,
          code: p.code as string | undefined,
          actorName: nameOf(p.createdBy as string),
          timestamp: tsIso(p.createdAt),
        }),
      );
    }
  }

  const filtered = filterByDateWindow(events, (e) => e.timestamp, from, to);
  filtered.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return filtered.slice(0, limit);
}
