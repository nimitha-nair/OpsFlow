import axios from "axios";

import { clearAuth, getStoredToken } from "./storage";

/**
 * Base URL for the backend API.
 * - In dev, defaults to "/api", which the Vite proxy forwards to the backend
 *   (see vite.config.ts) — this avoids CORS without backend changes.
 * - In production, set VITE_API_BASE_URL to the deployed backend origin.
 */
const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const api = axios.create({ baseURL });

// Inject the Authorization header from the persisted JWT on every request.
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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
