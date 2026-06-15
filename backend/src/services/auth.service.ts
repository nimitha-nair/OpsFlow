import bcrypt from "bcrypt";
import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import UserRole from "../types/roles";
import type { UserDocument } from "../types/user.types";
import type { LoginResponse } from "../types/auth.types";
import { signToken } from "../utils/jwt";

const USERS_COLLECTION = "users";
const SALT_ROUNDS = 12;

/**
 * A fixed bcrypt hash used to perform a "wasted" comparison when no matching
 * user is found. This keeps the response time for unknown emails similar to
 * that of a wrong password, mitigating user-enumeration via timing.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("opsflow::nonexistent", SALT_ROUNDS);

/** Domain error carrying the HTTP status the controller should respond with. */
export class AuthError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findUserByEmail(email: string): Promise<UserDocument | null> {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", normalizeEmail(email))
    .limit(1)
    .get();

  const doc = snapshot.docs[0];
  if (!doc) {
    return null;
  }

  const data = doc.data() as Omit<UserDocument, "id">;
  return { id: doc.id, ...data };
}

/**
 * Authenticate a user by email + password and return a signed token alongside a
 * password-free user view. Throws {@link AuthError} for any auth failure.
 */
export async function loginWithCredentials(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const user = await findUserByEmail(email);

  // Always run bcrypt.compare (against a dummy hash when the user is missing)
  // so timing does not reveal whether the email exists.
  const passwordMatches = await bcrypt.compare(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AuthError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new AuthError(403, "Account is inactive");
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Idempotently create the default administrator account if it does not already
 * exist. Credentials default to the documented values but can be overridden via
 * the ADMIN_EMAIL / ADMIN_PASSWORD environment variables.
 */
export async function ensureDefaultAdmin(): Promise<{
  created: boolean;
  email: string;
}> {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? "admin@opsflow.local");
  const password = process.env.ADMIN_PASSWORD ?? "Admin@123";

  const existing = await db
    .collection(USERS_COLLECTION)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { created: false, email };
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const now = FieldValue.serverTimestamp();

  await db.collection(USERS_COLLECTION).add({
    name: "OpsFlow Administrator",
    email,
    passwordHash,
    role: UserRole.ADMIN,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return { created: true, email };
}
