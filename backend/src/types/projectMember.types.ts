import type { Timestamp } from "firebase-admin/firestore";

import type { PublicUser } from "./user.types";

/** Internal representation of a project membership stored in Firestore. */
export interface ProjectMemberDocument {
  id: string;
  projectId: string;
  userId: string;
  assignedAt: Timestamp;
  assignedBy: string;
}

/** Client-facing membership, enriched with the assigned user's public profile. */
export interface ProjectMemberView {
  id: string;
  projectId: string;
  userId: string;
  assignedAt: string;
  assignedBy: string;
  /** The assigned user, or null if the account no longer exists. */
  user: PublicUser | null;
}
