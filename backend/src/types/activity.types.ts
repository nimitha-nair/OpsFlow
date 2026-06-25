/**
 * Activity feed is *derived on read* — there is no `activity` collection. Events
 * are projected from existing documents (tickets, tasks, expenses, users,
 * projects) at request time and merged into one timeline. This trades granular
 * change history for zero instrumentation and instant, real data.
 */

export const ACTIVITY_ENTITIES = [
  "ticket",
  "task",
  "expense",
  "reimbursement",
  "user",
  "project",
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

/** A single, client-facing activity event. */
export interface ActivityEvent {
  /** Synthetic, stable id: `${entity}:${entityId}:${verb}`. */
  id: string;
  entity: ActivityEntity;
  entityId: string;
  /** Human-readable code (e.g. TKT-0003) when the entity has one. */
  code?: string;
  /** What happened: created | updated | reviewed | joined. */
  verb: string;
  /** Headline, e.g. "Ticket opened" or "Expense approved". */
  title: string;
  /** Secondary line, e.g. the subject/description or "now In Progress". */
  description?: string;
  actorId?: string;
  actorName?: string;
  /** ISO-8601 timestamp the event occurred. */
  timestamp: string;
}
