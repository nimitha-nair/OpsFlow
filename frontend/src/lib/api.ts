import axios from "axios";

import { clearAuth, getStoredToken } from "./storage";

/**
 * Base URL for the backend API.
 * - In dev, defaults to "/api", which the Vite proxy forwards to the backend
 *   (see vite.config.ts) — this avoids CORS without backend changes.
 * - In production (Cloudflare Pages), set the API origin via env:
 *     VITE_API_BASE_URL (preferred) or VITE_API_URL (alias),
 *   e.g. "https://api.example.com" — the Cloudflare Tunnel hostname.
 *   Alternatively keep "/api" and proxy it to the tunnel with a Pages
 *   `_redirects` rule (same-origin, no CORS). See docs/DEPLOYMENT.md.
 */
const baseURL =
  import.meta.env.VITE_API_BASE_URL ??
  import.meta.env.VITE_API_URL ??
  "/api";

export const api = axios.create({ baseURL });

// Inject the Authorization header from the persisted JWT on every request.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // TEMP DEBUG (login trace) — remove after diagnosis. Logs the exact URL the
  // browser will request, so we can see baseURL + path resolution.
  console.log("[api-debug] request", {
    method: config.method,
    baseURL: config.baseURL,
    url: config.url,
    resolved: `${config.baseURL ?? ""}${config.url ?? ""}`,
  });
  return config;
});

// On 401 (expired/invalid token), clear the stored session so the app falls
// back to the login flow.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
    }
    return Promise.reject(error);
  },
);
