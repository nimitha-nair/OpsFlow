import type UserRole from "./roles";
import type { Timestamp } from "firebase-admin/firestore";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Internal representation of a user as stored in Firestore.
 *
 * Includes `passwordHash` and is therefore NEVER serialized to a client.
 * Use the public `User` shape (or an explicit projection) for responses.
 */
export interface UserDocument {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}