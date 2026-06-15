import type { Request, Response } from "express";

import { AuthError, loginWithCredentials } from "../services/auth.service";

/**
 * POST /auth/login
 * Validates the request body, delegates authentication to the service, and
 * returns the login response. Never leaks why authentication failed.
 */
export async function login(req: Request, res: Response): Promise<Response> {
  const { email, password } = (req.body ?? {}) as {
    email?: unknown;
    password?: unknown;
  };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password === ""
  ) {
    return res
      .status(400)
      .json({ error: "Email and password are required" });
  }

  try {
    const result = await loginWithCredentials(email, password);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Unexpected login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
