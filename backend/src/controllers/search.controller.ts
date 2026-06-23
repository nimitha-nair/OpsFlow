import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import type UserRole from "../types/roles";
import { globalSearch } from "../services/search.service";

/** GET /search?q= — RBAC-scoped cross-entity search. */
export async function getSearch(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const q = (req.valid?.query as { q?: string } | undefined)?.q ?? "";
    const results = await globalSearch(q, {
      userId: req.user.userId,
      role: req.user.role as UserRole,
    });
    return res.status(200).json({ results });
  } catch (err) {
    if (err instanceof ApiError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error("Unexpected search-controller error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
