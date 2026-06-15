import type { NextFunction, Request, Response } from "express";

import { verifyToken } from "../utils/jwt";

const BEARER_PREFIX = "Bearer ";

/**
 * Authentication middleware: validates the Bearer JWT from the Authorization
 * header, and attaches the decoded payload to `req.user`. Responds with 401 if
 * the header is missing/malformed or the token is invalid or expired.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    res
      .status(401)
      .json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
