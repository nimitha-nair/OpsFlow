import type { Request, Response } from "express";

import { AuthError, loginWithCredentials } from "../services/auth.service";
import { createQrToken, exchangeQrToken } from "../services/qr-login.service";
import type { LoginInput, QrExchangeInput } from "../validation/auth.schema";

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

/**
 * POST /auth/qr/start — authenticated. Issues a short-lived, single-use token
 * the caller encodes into a QR code for logging in on another device.
 */
export async function qrStart(req: Request, res: Response): Promise<Response> {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const result = await createQrToken(req.user.userId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Unexpected qr-start error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /auth/qr/exchange — public. Swaps a scanned QR token for a full session
 * (token + user), identical in shape to the login response.
 */
export async function qrExchange(
  req: Request,
  res: Response,
): Promise<Response> {
  const { token } = req.valid?.body as QrExchangeInput;
  try {
    const result = await exchangeQrToken(token);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Unexpected qr-exchange error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
