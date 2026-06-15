import type { NextFunction, Request, RequestHandler, Response } from "express";

import UserRole from "../types/roles";

/**
 * Role-based access control middleware factory.
 *
 * Returns a middleware that allows the request through only if the
 * authenticated user's role is one of `allowedRoles`. Must run AFTER the
 * `authenticate` middleware, which populates `req.user`.
 *
 * - 401 if the request is not authenticated (no `req.user`).
 * - 403 if the user's role is not permitted.
 *
 * @example
 *   router.get("/admin", authenticate, authorize(UserRole.ADMIN), handler);
 *   router.get("/staff", authenticate, authorize(UserRole.ADMIN, UserRole.HR), handler);
 */
export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
