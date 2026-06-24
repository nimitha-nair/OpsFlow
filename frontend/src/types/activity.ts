export const ACTIVITY_ENTITIES = [
  "ticket",
  "task",
  "expense",
  "reimbursement",
  "user",
  "project",
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

/** Client-facing activity event (mirrors the backend shape). */
export interface ActivityEvent {
  id: string;
  entity: ActivityEntity;
  entityId: string;
  code?: string;
  verb: string;
  title: string;
  description?: string;
  actorId?: string;
  actorName?: string;
  /** ISO-8601 timestamp. */
  timestamp: string;
}
