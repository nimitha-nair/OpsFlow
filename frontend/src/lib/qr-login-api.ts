import { api } from "./api";
import type { LoginResponse } from "../types/auth";

/** POST /auth/qr/start (authenticated) — mint a short-lived QR login token. */
export async function qrStart(): Promise<{
  token: string;
  expiresInSeconds: number;
}> {
  const { data } = await api.post<{ token: string; expiresInSeconds: number }>(
    "/auth/qr/start",
  );
  return data;
}

/** POST /auth/qr/exchange (public) — swap a scanned token for a session. */
export async function qrExchange(token: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/qr/exchange", { token });
  return data;
}
