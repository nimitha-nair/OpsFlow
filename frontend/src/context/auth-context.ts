import { createContext, useContext } from "react";

import type { AuthUser } from "../types/auth";

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** Authenticate against the backend; resolves with the logged-in user. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Establish a session from an already-issued token + user (e.g. QR login). */
  loginWithSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
