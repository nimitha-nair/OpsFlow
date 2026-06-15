import jwt from "jsonwebtoken";

import type { JwtPayload } from "../types/auth.types";

/** Token lifetime: 24 hours, expressed in seconds. */
const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24;

/**
 * Read the JWT signing secret from the environment. Throws if it is missing so
 * the app fails fast instead of signing tokens with an undefined/empty secret.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY_SECONDS });
}

/**
 * Verify a token's signature and expiry, and confirm it carries the expected
 * payload shape. Throws on any failure (invalid signature, expired, malformed).
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (typeof decoded === "string" || !hasJwtPayloadShape(decoded)) {
    throw new Error("Malformed token payload");
  }
  return { userId: decoded.userId, email: decoded.email, role: decoded.role };
}

function hasJwtPayloadShape(
  value: jwt.JwtPayload,
): value is jwt.JwtPayload & JwtPayload {
  return (
    typeof value.userId === "string" &&
    typeof value.email === "string" &&
    typeof value.role === "string"
  );
}
