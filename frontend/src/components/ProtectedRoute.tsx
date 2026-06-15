import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../context/auth-context";
import type { Role } from "../types/auth";
import { roleHome } from "../types/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, the user's role must be one of these to access the route. */
  allowedRoles?: Role[];
}

/**
 * Guards a route:
 * - Unauthenticated users are redirected to /login.
 * - Authenticated users whose role is not permitted are redirected to their
 *   own home area (so an EMPLOYEE hitting /admin lands on /employee).
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <>{children}</>;
}
