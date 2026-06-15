import { api } from "./api";
import type {
  CreateUserPayload,
  ListUsersParams,
  UpdateUserPayload,
  User,
  UsersListResponse,
} from "../types/user";

/** GET /users — paginated, filterable list (ADMIN/HR). */
export async function listUsers(
  params: ListUsersParams = {},
): Promise<UsersListResponse> {
  const { data } = await api.get<UsersListResponse>("/users", { params });
  return data;
}

/** GET /users/:id */
export async function getUser(id: string): Promise<User> {
  const { data } = await api.get<User>(`/users/${id}`);
  return data;
}

/** POST /users (ADMIN) */
export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await api.post<User>("/users", payload);
  return data;
}

/** PATCH /users/:id (ADMIN) */
export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, payload);
  return data;
}

/** PATCH /users/:id/status (ADMIN) */
export async function setUserStatus(
  id: string,
  isActive: boolean,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/status`, { isActive });
  return data;
}

/** Extract a human-readable message from an Axios error response. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { data?: { error?: string } } })
      .response;
    if (response?.data?.error) {
      return response.data.error;
    }
  }
  return fallback;
}
