import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../lib/api";
import { clearAuth, getStoredUser, persistAuth } from "../lib/storage";
import type { AuthUser, LoginResponse } from "../types/auth";
import { AuthContext } from "./auth-context";
import type { AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialize synchronously from localStorage so there is no unauthenticated
  // flash on reload and ProtectedRoute can decide immediately.
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      persistAuth(data.token, data.user);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback((): void => {
    clearAuth();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, login, logout }),
    [user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
