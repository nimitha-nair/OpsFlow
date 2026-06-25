import type { Timestamp } from "firebase-admin/firestore";

export const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Internal representation of a project as stored in Firestore. */
export interface ProjectDocument {
  id: string;
  /** Human-readable code (PRJ-001). Optional until backfilled. */
  code?: string;
  name: string;
  description: string;
  clientName: string;
  budget: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  /** When true the project is read-only (archived). Historical data stays visible. */
  archived?: boolean;
  archivedAt?: Timestamp;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing project shape; timestamps serialized as ISO-8601 strings. */
export interface Project {
  id: string;
  code?: string;
  name: string;
  description: string;
  clientName: string;
  budget: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  archived: boolean;
  archivedAt?: string;
  createdBy: string;
  /** Display name of the creator, resolved from the users collection. */
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}
