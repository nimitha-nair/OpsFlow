/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API origin in production (e.g. the Cloudflare Tunnel hostname). */
  readonly VITE_API_BASE_URL?: string;
  /** Alias for VITE_API_BASE_URL. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
