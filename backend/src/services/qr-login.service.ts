import { randomBytes } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import type { LoginResponse } from "../types/auth.types";
import { signToken } from "../utils/jwt";
import { AuthError } from "./auth.service";
import { getUserById } from "./user.service";

const QR_TOKENS_COLLECTION = "qr_login_tokens";
/** QR tokens are deliberately short-lived to limit the scan window. */
const QR_TOKEN_TTL_MS = 2 * 60 * 1000; // 2 minutes

interface QrTokenDoc {
  userId: string;
  used: boolean;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

/**
 * Create a short-lived, single-use QR login token bound to an authenticated
 * user. The (high-entropy, random) token is the Firestore document id, so the
 * exchange is an O(1) lookup.
 */
export async function createQrToken(
  userId: string,
): Promise<{ token: string; expiresInSeconds: number }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Timestamp.fromMillis(Date.now() + QR_TOKEN_TTL_MS);
  await db.collection(QR_TOKENS_COLLECTION).doc(token).set({
    userId,
    used: false,
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { token, expiresInSeconds: Math.floor(QR_TOKEN_TTL_MS / 1000) };
}

/**
 * Exchange a QR token for a full session. Validates existence, expiry and
 * single-use atomically (so a token can never be redeemed twice), then issues a
 * normal login token for the bound user.
 */
export async function exchangeQrToken(token: string): Promise<LoginResponse> {
  const ref = db.collection(QR_TOKENS_COLLECTION).doc(token);

  const userId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new AuthError(401, "Invalid or expired QR code");
    }
    const data = snap.data() as QrTokenDoc;
    if (data.used) {
      throw new AuthError(401, "This QR code has already been used");
    }
    if (data.expiresAt.toMillis() < Date.now()) {
      throw new AuthError(401, "This QR code has expired");
    }
    tx.update(ref, { used: true, usedAt: FieldValue.serverTimestamp() });
    return data.userId;
  });

  let user;
  try {
    user = await getUserById(userId);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) {
      throw new AuthError(401, "Account not found");
    }
    throw err;
  }
  if (!user.isActive) {
    throw new AuthError(403, "Account is inactive");
  }

  const sessionToken = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    token: sessionToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
