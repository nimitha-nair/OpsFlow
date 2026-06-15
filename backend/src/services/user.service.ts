import bcrypt from "bcrypt";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import UserRole from "../types/roles";
import type { PublicUser, UserDocument } from "../types/user.types";
import { ApiError } from "../utils/errors";

const USERS_COLLECTION = "users";
const SALT_ROUNDS = 12;

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: UserRole;
  department?: string;
}

export interface ListUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface PaginatedUsers {
  data: PublicUser[];
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
  // Defensive: a resolved Firestore read should always be a Timestamp.
  return new Date(0).toISOString();
}

/** Project a stored document to the password-free public shape. */
function toPublicUser(user: UserDocument): PublicUser {
  const base: PublicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: timestampToIso(user.createdAt),
    updatedAt: timestampToIso(user.updatedAt),
  };
  return user.department !== undefined
    ? { ...base, department: user.department }
    : base;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function getUserDocById(id: string): Promise<UserDocument | null> {
  const snap = await db.collection(USERS_COLLECTION).doc(id).get();
  if (!snap.exists) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Omit<UserDocument, "id">) };
}

/** True if any user already uses this (normalized) email, excluding `exceptId`. */
async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", normalizeEmail(email))
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  return doc !== undefined && doc.id !== exceptId;
}

/** Fetch a single user by id, throwing 404 if absent. */
export async function getUserById(id: string): Promise<PublicUser> {
  const user = await getUserDocById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  return toPublicUser(user);
}

/**
 * List users with in-memory filtering, search, and pagination.
 * NOTE: reads the collection ordered by createdAt and filters in memory to keep
 * substring search correct and avoid composite-index requirements. For very
 * large collections this should move to indexed queries / a search service.
 */
export async function listUsers(
  params: ListUsersParams,
): Promise<PaginatedUsers> {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .get();

  let users: UserDocument[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<UserDocument, "id">),
  }));

  if (params.role !== undefined) {
    users = users.filter((u) => u.role === params.role);
  }
  if (params.isActive !== undefined) {
    users = users.filter((u) => u.isActive === params.isActive);
  }
  if (params.search) {
    const needle = params.search.trim().toLowerCase();
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle),
    );
  }

  const total = users.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / params.limit);
  const start = (params.page - 1) * params.limit;
  const pageItems = users.slice(start, start + params.limit);

  return {
    data: pageItems.map(toPublicUser),
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
    },
  };
}

/** Create a user. Throws 409 if the email is already in use. */
export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  const email = normalizeEmail(input.email);

  if (await emailTaken(email)) {
    throw new ApiError(409, "A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const now = FieldValue.serverTimestamp();

  const data: Record<string, unknown> = {
    name: input.name.trim(),
    email,
    passwordHash,
    role: input.role,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  if (input.department !== undefined) {
    data.department = input.department.trim();
  }

  const ref = await db.collection(USERS_COLLECTION).add(data);
  const created = await getUserDocById(ref.id);
  if (!created) {
    throw new ApiError(500, "Failed to load the created user");
  }
  return toPublicUser(created);
}

/**
 * Update mutable profile fields (name, email, role, department).
 * `actingUserId` is the id of the requester, used to prevent self role-change.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actingUserId: string,
): Promise<PublicUser> {
  const user = await getUserDocById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) {
    updates.name = input.name.trim();
  }

  if (input.department !== undefined) {
    updates.department = input.department.trim();
  }

  if (input.role !== undefined && input.role !== user.role) {
    if (id === actingUserId) {
      throw new ApiError(400, "You cannot change your own role");
    }
    updates.role = input.role;
  }

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (email !== user.email) {
      if (await emailTaken(email, id)) {
        throw new ApiError(409, "A user with this email already exists");
      }
      updates.email = email;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  updates.updatedAt = FieldValue.serverTimestamp();
  await db.collection(USERS_COLLECTION).doc(id).update(updates);

  const updated = await getUserDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated user");
  }
  return toPublicUser(updated);
}

/** Activate or deactivate a user. Prevents deactivating your own account. */
export async function setUserStatus(
  id: string,
  isActive: boolean,
  actingUserId: string,
): Promise<PublicUser> {
  const user = await getUserDocById(id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (id === actingUserId && isActive === false) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  await db.collection(USERS_COLLECTION).doc(id).update({
    isActive,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const updated = await getUserDocById(id);
  if (!updated) {
    throw new ApiError(500, "Failed to load the updated user");
  }
  return toPublicUser(updated);
}
