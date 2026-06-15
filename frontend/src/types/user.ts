import type { Role } from "./auth";

/** Password-free user shape returned by the backend (GET /users, etc.). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  department?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Shape of GET /users. */
export interface UsersListResponse {
  data: User[];
  pagination: Pagination;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  isActive?: boolean;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  role: Role;
  department?: string;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: Role;
  department?: string;
}
