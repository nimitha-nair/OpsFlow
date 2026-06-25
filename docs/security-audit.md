# OpsFlow Backend — Security Audit Report

Scope: validation, security headers, input handling, and access control for the
OpsFlow Express + Firestore backend. No business functionality was changed.

Date: 2026-06-15

---

## 1. Endpoint inventory & access control

| Method & path | Auth | RBAC | Body/Query/Param validation |
|---|---|---|---|
| `GET /health` | none | none | — |
| `POST /auth/login` | none | none | `loginBody` (+ rate limit) |
| `GET /users/me` | JWT | any authenticated | — (uses token only) |
| `GET /users` | JWT | ADMIN, HR | `listUsersQuery` |
| `GET /users/:id` | JWT | ADMIN, HR | `idParams` |
| `POST /users` | JWT | ADMIN | `createUserBody` |
| `PATCH /users/:id` | JWT | ADMIN | `idParams` + `updateUserBody` |
| `PATCH /users/:id/status` | JWT | ADMIN | `idParams` + `userStatusBody` |
| `GET /projects` | JWT | ADMIN, HR | `listProjectsQuery` |
| `GET /projects/:id` | JWT | ADMIN, HR | `idParams` |
| `POST /projects` | JWT | ADMIN | `createProjectBody` |
| `PATCH /projects/:id` | JWT | ADMIN | `idParams` + `updateProjectBody` |
| `GET /example/*` | JWT | per-route | — (demo endpoints) |
| `GET /test-protected` | JWT | any authenticated | — (debug endpoint) |

RBAC review result: **every data endpoint runs `authenticate` then `authorize(...)`
before any handler.** `EMPLOYEE` has no access to users or projects (verified:
`GET /users` as EMPLOYEE → 403; `POST /projects` as HR → 403). `createdBy` and the
"acting user" for self-lockout checks are taken from the verified JWT, never the body.

---

## 2. Existing protections (pre-audit)

- **JWT authentication** — Bearer token verified (signature + expiry + payload
  shape) by `authenticate`; secret loaded from env and fails fast if unset.
- **RBAC middleware** — `authorize(...roles)` returns 401 if unauthenticated, 403
  if the role is not permitted.
- **Password handling** — bcrypt (cost 12); `passwordHash` never returned (public
  projections); generic 401 on login + dummy-hash compare to resist user
  enumeration / timing.
- **Constant Firestore paths** — collection names (`users`, `projects`) are
  hard-coded constants, never built from user input.
- **Type/field discipline at the service layer** — services whitelist fields when
  writing (no raw `req.body` spread into Firestore), and self-lockout guards
  prevent an admin from demoting/deactivating themselves.

## 3. Newly added protections (this audit)

- **Zod validation on every endpoint that accepts input** — body, query, and
  route params are parsed with strict schemas via a shared `validate` middleware.
  Controllers now consume only `req.valid.*`; no handler reads raw `req.body`,
  `req.query`, or `req.params`. (Routes with no input — `/users/me` — rely solely
  on the verified token.)
- **Consistent validation error responses** — all validation failures return
  `400 { "error": "Validation failed", "details": [{ "field", "message" }] }`.
- **Strict bodies (mass-assignment protection)** — create/update body schemas use
  `.strict()`, so unknown fields (e.g. `isAdmin`, `passwordHash`) are rejected
  with 400 instead of being silently ignored.
- **NoSQL / type-confusion hardening** — schemas enforce primitive types, so an
  attacker cannot pass an object/array where a string is expected (e.g.
  `email: { ... }` is rejected). Firestore's Admin SDK is not subject to operator
  injection, and validated string values feed `where()` clauses.
- **Path-traversal protection on document ids** — `firestoreId` rejects ids
  containing `/` (which would re-target a different document/collection), the `.`
  / `..` ids, and Firestore's reserved `__*__` pattern. Collection/document paths
  are therefore never derived from unvalidated input.
- **URL validation utility** — `httpUrl` (http/https only, blocks `javascript:`,
  `data:`, `file:`) is available for any future URL input. *No current endpoint
  accepts a URL field, so there is nothing to apply it to today.*
- **Helmet** — security headers enabled (`X-Content-Type-Options: nosniff`,
  frameguard, HSTS, CSP defaults, etc.); `x-powered-by` disabled.
- **Rate limiting** — strict limiter on `POST /auth/login` (10 requests / IP /
  15 min) to slow brute-force / credential stuffing; a baseline limiter
  (300 / IP / 15 min) across the whole API.
- **Body-size cap** — `express.json({ limit: "100kb" })` to limit payload abuse.
- **Consistent error handling** — malformed JSON → `400 { error: "Malformed JSON
  in request body" }`; oversized body → `413`; unexpected errors → generic `500`
  (no stack leaked to clients).

Verified by a live integration suite (16 checks: Helmet headers, RBAC 401/403/200,
id path-injection, reserved-id rejection, strict-body rejection, type-confusion
rejection, malformed JSON, consistent error shape, and the auth 429 limiter).

## 4. Remaining risks / recommendations

- **No `trust proxy` configured.** Rate limiting keys on the socket IP. Behind a
  load balancer / reverse proxy in production, set `app.set("trust proxy", …)`
  correctly (and only to trusted hops) so limits apply per real client IP without
  enabling IP spoofing. In-memory rate-limit store also does not share state
  across multiple instances — use a shared store (e.g. Redis) when scaling out.
- **Debug/demo endpoints exposed.** `GET /test-protected` and `/example/*` echo
  the token payload and exist only for demonstration. Recommend removing them (or
  gating behind a non-production flag) before deploy.
- **No CORS policy in the backend.** The frontend currently reaches the API via a
  Vite dev proxy. For production, add an explicit allow-list CORS policy rather
  than relying on the proxy.
- **Email uniqueness race** (pre-existing). `createUser` does check-then-write;
  two simultaneous creates of the same email could both pass. Consider an
  email-keyed sentinel document for a hard uniqueness guarantee.
- **In-memory list filtering** (pre-existing, not a security issue). `GET /users`
  and `GET /projects` read the whole collection then filter/paginate in memory;
  fine for team-sized data, revisit for scale.
- **No audit logging / account lockout.** Failed logins are rate-limited but not
  logged or locked per-account. Consider structured auth logging and lockout
  thresholds for higher-assurance environments.
- **Secrets management.** `JWT_SECRET` and the service account come from env/file;
  ensure they are provisioned via a secrets manager in production and rotated.
