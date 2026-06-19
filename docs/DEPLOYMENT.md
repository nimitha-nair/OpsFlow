# OpsFlow Deployment — Cloudflare Pages (frontend) + Cloudflare Tunnel (backend)

This document is the deployment audit result + a step-by-step checklist. The
frontend is a static Vite/React SPA served by **Cloudflare Pages**; the backend
is a Node/Express API exposed through a **Cloudflare Tunnel** (`cloudflared`).

---

## Audit findings & fixes

| # | Issue | Status | Fix |
|---|-------|--------|-----|
| 1 | **No CORS on the API.** `app.ts` had `helmet()` but no CORS middleware — every cross-origin Pages→Tunnel request would be blocked by the browser. | **Fixed** | Added `middleware/cors.ts` (dependency-free; `@types/cors` wasn't installed). Allowlist via `CORS_ORIGINS`; answers preflight; allows the `Authorization` header. |
| 2 | **API base URL env.** App read only `VITE_API_BASE_URL` (default `/api`, which only works with the dev proxy). | **Fixed** | `api.ts` now reads `VITE_API_BASE_URL` **or** `VITE_API_URL` (alias), still defaulting to `/api`. Typed in `vite-env.d.ts`. |
| 3 | **Tunnel client IP / rate limiting.** Behind `cloudflared`, `req.ip` is the tunnel's loopback, so per-IP rate limits bucket everyone together (and express-rate-limit warns about `X-Forwarded-For`). | **Fixed** | `app.set("trust proxy", …)` via `TRUST_PROXY` (defaults to `1` in production). |
| 4 | **Cross-origin resource policy.** Helmet's default `Cross-Origin-Resource-Policy: same-origin` can interfere with cross-origin asset loads. | **Fixed** | Helmet configured with `crossOriginResourcePolicy: { policy: "cross-origin" }`. |
| 5 | **Health check throttled.** `/health` was behind the rate limiter. | **Fixed** | Moved `/health` ahead of the limiter so tunnel/uptime probes never throttle. |
| 6 | **Firebase creds required a file on disk.** Only `secrets/service-account.json` was read; the documented `FIREBASE_*` env vars were ignored. | **Fixed** | `config/firebase.ts` now prefers `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (unescaping `\n`), falling back to the file. No secret file needs to ship. |
| 7 | **Hardcoded localhost.** | **None in app code** | The only `localhost` is `vite.config.ts`'s **dev** proxy target (`BACKEND_URL`, dev-only — not in the production build). `ErrorBoundary` uses `window.location.reload()` (origin-relative, fine). |
| 8 | **Upload / download / receipt preview URL assumptions.** | **No change needed** | Every document call goes through the axios `api` instance with **relative** paths (`/expenses/:id/documents/:docId/file`) + blob object URLs. The `ExpenseFileView.url` field is never fetched directly. The pdf.js worker is bundled (`?url`) and served same-origin from Pages. All work cross-origin once CORS is set (fix #1). |
| 9 | **SPA deep links 404 on refresh.** Static hosting returns 404 for client routes like `/admin/expenses/:id/report` on hard refresh. | **Action required** | Add a Pages SPA fallback (`/* /index.html 200`) — see step 2. |

Body size: uploads use `multer` (5 MB/file cap); the JSON parser cap is 100 KB —
unaffected by uploads. Cloudflare's default request body limit is 100 MB, well
above the 5 MB receipt cap.

---

## Required environment variables

### Backend (the host running the API, behind the tunnel)
| Var | Required | Notes |
|-----|----------|-------|
| `NODE_ENV` | yes | `production` (enables strict rate limits + `TRUST_PROXY` default). |
| `PORT` | no | Defaults to `5000`. `cloudflared` points at `http://localhost:$PORT`. |
| `JWT_SECRET` | **yes** | Long random string. App refuses to sign tokens without it. |
| `CORS_ORIGINS` | **yes (cross-origin mode)** | Comma-separated Pages origins, e.g. `https://opsflow.pages.dev`. Omit if using the `_redirects` proxy (same-origin). |
| `TRUST_PROXY` | recommended | `1` (one hop = cloudflared). Defaults to `1` in production. |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | **yes** | Or a JSON key via `SERVICE_ACCOUNT_PATH`. |
| `STORAGE_BACKEND` | yes | `firebase` for production (needs `FIREBASE_STORAGE_BUCKET` + Blaze billing) or `local`. |
| `FIREBASE_STORAGE_BUCKET` | if `firebase` | e.g. `opsflow-cc01b.firebasestorage.app`. |
| `AI_PROVIDER` | yes | `kimi` or `mock`. |
| `NVIDIA_API_KEY` | if `kimi` | NVIDIA Build key. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | no | Seeds the default admin on first boot. Change the password after. |

### Frontend (Cloudflare Pages build env)
| Var | Required | Notes |
|-----|----------|-------|
| `VITE_API_BASE_URL` | **yes (cross-origin mode)** | The tunnel hostname, e.g. `https://api.example.com`. `VITE_API_URL` works as an alias. Omit when using the `_redirects` proxy. |

---

## Checklist

### 1. Backend behind Cloudflare Tunnel
- [ ] Set the backend env vars above (`.env` or your process manager). Set `NODE_ENV=production`.
- [ ] `cd backend && npm ci && npm run build && npm start` (or `node dist/server.js`).
- [ ] Install `cloudflared` and create a tunnel: `cloudflared tunnel create opsflow-api`.
- [ ] Route a hostname to it (e.g. `api.example.com`) and map the ingress to `http://localhost:5000`.
- [ ] Verify: `https://api.example.com/health` → `{"status":"ok"}`.

### 2. Frontend on Cloudflare Pages
Pick ONE API connectivity mode:

**A) Cross-origin (simplest infra):**
- [ ] Pages build env: `VITE_API_BASE_URL=https://api.example.com`.
- [ ] Backend env: `CORS_ORIGINS=https://<your-project>.pages.dev` (+ any custom domain).
- [ ] Add a Pages SPA fallback so deep links work — a `frontend/public/_redirects` containing just:
      `/*  /index.html  200`

**B) Same-origin proxy (no CORS):**
- [ ] Copy `frontend/public/_redirects.example` → `frontend/public/_redirects`, set the tunnel host, keep the SPA fallback line.
- [ ] Leave `VITE_API_BASE_URL` unset (defaults to `/api`, proxied to the tunnel).

Then:
- [ ] Pages build: command `npm run build`, output dir `dist`, root `frontend/`.
- [ ] Deploy and open the Pages URL; log in (`admin@opsflow.local` / seeded password).

### 3. Smoke test in the browser
- [ ] Login works (no CORS error in the console).
- [ ] Submit an expense, upload a receipt (multipart POST succeeds).
- [ ] Receipt preview renders (image + PDF) and the multi-document viewer loads.
- [ ] Download a document; export a report PDF (print dialog).
- [ ] Reports tabs + dashboards load data.

### Notes
- Cloudflare terminates TLS at the edge; the backend speaks plain HTTP to `cloudflared` — that's expected. Keep the backend bound to localhost / firewalled so it's reachable **only** through the tunnel.
- If you rotate `CORS_ORIGINS` or `VITE_API_BASE_URL`, redeploy (the latter is build-time on Pages).
