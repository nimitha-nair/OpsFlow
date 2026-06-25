import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import { filterByDateWindow } from "../utils/date-window";
import { generateCode } from "./code-generator";
import type {
  Project,
  ProjectDocument,
  ProjectStatus,
} from "../types/project.types";

const PROJECTS_COLLECTION = "projects";

export interface CreateProjectInput {
  name: string;
  description: string;
  clientName: string;
  budget: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  createdBy: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  clientName?: string;
  budget?: number;
  status?: ProjectStatus;
  startDate?: string;
  endDate?: string;
}

export interface ListProjectsParams {
  page: number;
  limit: number;
  search?: string;
  status?: ProjectStatus;
  from?: string;
  to?: string;
}

export interface PaginatedProjects {
  data: Project[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function timestampToIso(value: Timestamp): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return new Date(0).toISOString();
}

/** Resolve a single user's display name (undefined if missing). */
async function resolveCreatorName(uid?: string): Promise<string | undefined> {
  if (!uid) return undefined;
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? (snap.get("name") as string | undefined) : undefined;
}

/** Resolve display names for a set of user ids in one pass. */
async function resolveCreatorNames(
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  await Promise.all(
    unique.map(async (uid) => {
      const name = await resolveCreatorName(uid);
      if (name !== undefined) map.set(uid, name);
    }),
  );
  return map;
}

/** Project view without the budget, for non-ADMIN roles. */
export type SafeProject = Omit<Project, "budget">;

/** Remove the budget (and any future financial fields) from a project. */
export function stripBudget(project: Project): SafeProject {
  const safe: SafeProject = {
    id: project.id,
    name: project.name,
    description: project.description,
    clientName: project.clientName,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    archived: project.archived,
    createdBy: project.createdBy,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
  if (project.code !== undefined) safe.code = project.code;
  if (project.createdByName !== undefined)
    safe.createdByName = project.createdByName;
  if (project.archivedAt !== undefined) safe.archivedAt = project.archivedAt;
  return safe;
}

function toPublicProject(
  project: ProjectDocument,
  createdByName?: string,
): Project {
  const result: Project = {
    id: project.id,
    name: project.name,
    description: project.description,
    clientName: project.clientName,
    budget: project.budget,
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
    archived: project.archived ?? false,
    createdBy: project.createdBy,
    createdAt: timestampToIso(project.createdAt),
    updatedAt: timestampToIso(project.updatedAt),
  };
  if (project.code !== undefined) result.code = project.code;
  if (createdByName !== undefined) result.createdByName = createdByName;
  if (project.archivedAt !== undefined) {
    result.archivedAt = timestampToIso(project.archivedAt);
  }
  return result;
}

/** Build a public project with its creator's display name resolved. */
async function toPublicProjectHydrated(
  project: ProjectDocument,
): Promise<Project> {
  return toPublicProject(project, await resolveCreatorName(project.createdBy));
}

async function getProjectDocById(id: string): Promise<ProjectDocument | null> {
  const snap = await db.collection(PROJECTS_COLLECTION).doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<ProjectDocument, "id">) };
}

/** Fetch a single project by id, throwing 404 if absent. */
export async function getProjectById(id: string): Promise<Project> {
  const project = await getProjectDocById(id);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  return toPublicProjectHydrated(project);
}

/**
 * Ensure a project exists and is not archived. Throws 404 if absent, 409 if
 * archived. Used to block mutations (new tasks/expenses/members/edits) against
 * read-only archived projects. Returns the project for convenience.
 */
export async function assertProjectNotArchived(id: string): Promise<Project> {
  const project = await getProjectById(id);
  if (project.archived) {
    throw new ApiError(
      409,
      "This project is archived and read-only. Restore it to make changes.",
    );
  }
  return project;
}

/**
 * List projects with in-memory filtering, search, and pagination.
 * Ordered by createdAt desc; filtered in memory to keep substring search
 * correct and avoid composite-index requirements (fine for team-sized data).
 */
export async function listProjects(
  params: ListProjectsParams,
): Promise<PaginatedProjects> {
  const snapshot = await db
    .collection(PROJECTS_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();

  let projects: ProjectDocument[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<ProjectDocument, "id">),
  }));

  if (params.status !== undefined) {
    projects = projects.filter((p) => p.status === params.status);
  }
  if (params.search) {
    const needle = params.search.trim().toLowerCase();
    projects = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.clientName.toLowerCase().includes(needle),
    );
  }

  // Filter by the project's own start date (matches the pre-rollout UX), not
  // the record's creation time.
  projects = filterByDateWindow(
    projects,
    (p) => p.startDate,
    params.from,
    params.to,
  );

  const total = projects.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
  const start = (params.page - 1) * params.limit;
  const pageItems = projects.slice(start, start + params.limit);

  const nameById = await resolveCreatorNames(
    pageItems.map((p) => p.createdBy),
  );

  return {
    data: pageItems.map((p) => toPublicProject(p, nameById.get(p.createdBy))),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
    },
  };
}

/** Create a project. */
export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const now = FieldValue.serverTimestamp();

  const data = {
    code: await generateCode("project"),
    name: input.name.trim(),
    description: input.description.trim(),
    clientName: input.clientName.trim(),
    budget: input.budget,
    status: input.status,
    startDate: input.startDate,
    endDate: input.endDate,
    archived: false,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection(PROJECTS_COLLECTION).add(data);
  const created = await getProjectDocById(ref.id);
  if (!created) {
    throw new ApiError(500, "Failed to load the created project");
  }
  return toPublicProjectHydrated(created);
}

/** Update mutable project fields. Throws 404 if the project does not exist. */
export async function updateProject(
  id: string,
  input: UpdateProjectInput,
): Promise<Project> {
  const project = await getProjectDocById(id);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }
  if (project.archived) {
    throw new ApiError(
      409,
      "This project is archived and read-only. Restore it before editing.",
    );
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined)
    updates.description = input.description.trim();
  if (input.clientName !== undefined)
    updates.clientName = input.clientName.trim();
  if (input.budget !== undefined) updates.budget = input.budget;
  if (input.status !== undefined) updates.status = input.status;
  if (input.startDate !== undefined) updates.startDate = input.startDate;
  if (input.endDate !== undefined) updates.endDate = input.endDate;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await db.collection(PROJECTS_COLLECTION).doc(id).update(updates);

  const updated = await getProjectDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated project");
  }
  return toPublicProjectHydrated(updated);
}

/**
 * Archive or restore a project (ADMIN). Archiving makes it read-only; restoring
 * re-enables changes. Historical data (tasks, expenses, members) is untouched.
 */
export async function setProjectArchived(
  id: string,
  archived: boolean,
): Promise<Project> {
  const project = await getProjectDocById(id);
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  await db
    .collection(PROJECTS_COLLECTION)
    .doc(id)
    .update({
      archived,
      archivedAt: archived ? FieldValue.serverTimestamp() : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  const updated = await getProjectDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated project");
  }
  return toPublicProjectHydrated(updated);
}
