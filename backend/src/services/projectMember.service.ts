import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { PublicUser } from "../types/user.types";
import type {
  ProjectMemberDocument,
  ProjectMemberView,
} from "../types/projectMember.types";
import { assertProjectNotArchived, getProjectById } from "./project.service";
import { getUserById } from "./user.service";

const MEMBERS_COLLECTION = "projectMembers";

export interface AssignMemberInput {
  projectId: string;
  userId: string;
  assignedBy: string;
}

function timestampToMillis(value: Timestamp): number {
  return value instanceof Timestamp ? value.toMillis() : 0;
}

function timestampToIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

function toMemberView(
  doc: ProjectMemberDocument,
  user: PublicUser | null,
): ProjectMemberView {
  return {
    id: doc.id,
    projectId: doc.projectId,
    userId: doc.userId,
    assignedAt: timestampToIso(doc.assignedAt),
    assignedBy: doc.assignedBy,
    user,
  };
}

/** All membership documents for a project (single-field query, no index needed). */
async function getMembershipDocs(
  projectId: string,
): Promise<ProjectMemberDocument[]> {
  const snapshot = await db
    .collection(MEMBERS_COLLECTION)
    .where("projectId", "==", projectId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ProjectMemberDocument, "id">),
  }));
}

/** Whether a user is currently a member of a project. */
export async function isProjectMember(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const docs = await getMembershipDocs(projectId);
  return docs.some((m) => m.userId === userId);
}

/** Distinct project ids the user is a member of (single-field query). */
export async function getProjectIdsForUser(
  userId: string,
): Promise<string[]> {
  const snapshot = await db
    .collection(MEMBERS_COLLECTION)
    .where("userId", "==", userId)
    .get();

  const ids = snapshot.docs.map(
    (doc) => (doc.data() as Omit<ProjectMemberDocument, "id">).projectId,
  );
  return [...new Set(ids)];
}

/**
 * Assign an EMPLOYEE to a project.
 * - 404 if the project or user does not exist.
 * - 400 if the user is not an EMPLOYEE.
 * - 409 if the user is already assigned.
 */
export async function assignMember(
  input: AssignMemberInput,
): Promise<ProjectMemberView> {
  // Project must exist and not be archived (archived projects are read-only).
  await assertProjectNotArchived(input.projectId);

  // User must exist (throws 404 otherwise) and must be an EMPLOYEE.
  const user = await getUserById(input.userId);
  if (user.role !== UserRole.EMPLOYEE) {
    throw new ApiError(400, "Only EMPLOYEE users can be assigned to a project");
  }

  // No duplicate assignment.
  const existing = await getMembershipDocs(input.projectId);
  if (existing.some((m) => m.userId === input.userId)) {
    throw new ApiError(409, "User is already assigned to this project");
  }

  const ref = await db.collection(MEMBERS_COLLECTION).add({
    projectId: input.projectId,
    userId: input.userId,
    assignedBy: input.assignedBy,
    assignedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  const doc: ProjectMemberDocument = {
    id: snap.id,
    ...(snap.data() as Omit<ProjectMemberDocument, "id">),
  };
  return toMemberView(doc, user);
}

/** List a project's members (newest first), enriched with user profiles. */
export async function listMembers(
  projectId: string,
): Promise<ProjectMemberView[]> {
  // Project must exist.
  await getProjectById(projectId);

  const docs = await getMembershipDocs(projectId);
  docs.sort(
    (a, b) => timestampToMillis(b.assignedAt) - timestampToMillis(a.assignedAt),
  );

  return Promise.all(
    docs.map(async (doc) => {
      const user = await getUserById(doc.userId).catch(() => null);
      return toMemberView(doc, user);
    }),
  );
}

/** Remove a user from a project. 404 if project or membership is absent. */
export async function removeMember(
  projectId: string,
  userId: string,
): Promise<void> {
  // Project must exist.
  await getProjectById(projectId);

  const docs = await getMembershipDocs(projectId);
  const membership = docs.find((m) => m.userId === userId);
  if (!membership) {
    throw new ApiError(404, "This user is not a member of the project");
  }

  await db.collection(MEMBERS_COLLECTION).doc(membership.id).delete();
}
