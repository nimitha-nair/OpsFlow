import type { User } from "./user";

/** A project membership, enriched with the assigned user's profile. */
export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  assignedAt: string;
  assignedBy: string;
  /** The assigned user, or null if the account no longer exists. */
  user: User | null;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
}
