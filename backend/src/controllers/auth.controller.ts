import type { Request, Response } from "express";

import { AuthError, loginWithCredentials } from "../services/auth.service";
import type { LoginInput } from "../validation/auth.schema";

/**
 * POST /auth/login
 * Request body is validated upstream by the `validate` middleware; this handler
 * delegates to the service and never leaks why authentication failed.
 */
export async function login(req: Request, res: Response): Promise<Response> {
  const { email, password } = req.valid?.body as LoginInput;

  // TEMP DEBUG (login trace) — remove after diagnosis.
  console.log("[login-controller-debug] entered", { email });

  try {
    const result = await loginWithCredentials(email, password);
    console.log("[login-controller-debug] success", { email });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Unexpected login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
