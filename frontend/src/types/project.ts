export const PROJECT_STATUSES = [
  "PLANNING",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  /** Human-readable code (PRJ-001). Absent on docs created before backfill. */
  code?: string;
  name: string;
  description: string;
  clientName: string;
  budget: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  /** When true the project is archived (read-only). */
  archived: boolean;
  archivedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ProjectsListResponse {
  data: Project[];
  pagination: Pagination;
}

export interface ListProjectsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProjectStatus;
}

export interface CreateProjectPayload {
  name: string;
  description: string;
  clientName: string;
  budget: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
}

export type UpdateProjectPayload = Partial<CreateProjectPayload>;

/** Display labels for each status. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
