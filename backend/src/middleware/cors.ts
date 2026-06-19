import type { NextFunction, Request, Response } from "express";

/**
 * Cross-origin support for the split deployment (Cloudflare Pages frontend +
 * Cloudflare Tunnel backend on a different origin).
 *
 * Allowed origins come from `CORS_ORIGINS` (comma-separated). When it is unset we
 * reflect any origin — convenient for local dev and first-boot deployments — but
 * production should set an explicit allowlist. Auth is a Bearer JWT in the
 * Authorization header (not cookies), so credentials are not required; the
 * Authorization header is explicitly allowed for the (non-simple) preflight.
 */
const allowList = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (allowList.length === 0 || allowList.includes("*")) return true;
  return allowList.includes(origin);
}

export function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (isAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin as string);
    // Caches must key on the request origin since the header is dynamic.
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization,Content-Type,Accept",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Short-circuit preflight before auth/rate-limit/routes.
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
