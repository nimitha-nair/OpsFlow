# OpsFlow — API Design

> **Status:** Approved for MVP build
> **Style:** REST over HTTPS, JSON
> **Base path:** `/api`
> **Last updated:** 2026-06-12
> **Related docs:** [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) · [DATABASE.md](./DATABASE.md) · [WORKFLOWS.md](./WORKFLOWS.md) · [AI_PIPELINE.md](./AI_PIPELINE.md)

---

## 1. Conventions

### 1.1 Auth
- All endpoints require a valid **JWT** in `Authorization: Bearer <token>`,
  except `POST /api/auth/login` and `GET /api/health`.
- Authorization is enforced on **two layers**: **RBAC** (role) and **ownership**
  (resource belongs to the requester). See §10.
- **Per-request `is_active` check:** every authenticated request re-checks the
  user's `is_active` flag; a deactivated user is rejected (`401`) even if their JWT
  has not expired.
- **Auth policy:** passwords hashed with **argon2id**; access-token TTL ~8h;
  login rate-limiting/lockout; logout = client-side token discard (no server
  denylist in MVP).

### 1.2 IDs & timestamps
- All resource IDs are **UUID** strings.
- All resources return `created_at` and `updated_at` (ISO-8601).

### 1.3 Response envelope

Single resource:
```json
{ "data": { /* resource */ } }
```

List (paginated):
```json
{
  "data": [ /* resources */ ],
  "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7,
            "sort": "created_at:desc", "filters": {}, "search": null }
}
```

Error:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "amount must be > 0",
             "details": [ { "field": "amount", "issue": "min" } ] } }
```

### 1.4 Status codes
`200` OK · `201` Created · `204` No Content · `400` Bad Request ·
`401` Unauthorized · `403` Forbidden · `404` Not Found · `409` Conflict ·
`422` Unprocessable Entity · `429` Too Many Requests · `500` Server Error.

### 1.5 List query parameters (ALL list endpoints support these)

| Param | Example | Notes |
|---|---|---|
| `page` | `?page=2` | 1-based; default `1` |
| `limit` | `?limit=20` | default `20`, max `100` |
| `sort` | `?sort=created_at:desc` | `field:asc|desc`; multiple comma-separated |
| `search` | `?search=amazon` | free-text over indexed text fields |
| filters | `?status=APPROVED&projectId=<uuid>` | resource-specific (see each section) |

---

## 2. Auth & Account

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | public | Email + password → JWT |
| POST | `/api/auth/logout` | any | Invalidate client session |
| GET | `/api/auth/me` | any | Current user profile |
| POST | `/api/auth/change-password` | any | Change own password (current + new) |
| GET | `/api/health` | public | Liveness/readiness probe |

> **Excluded from MVP:** refresh tokens, password reset.
> **Bootstrap:** the first ADMIN is seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`
> env vars during DB setup (no public registration endpoint).

**Login request**
```json
{ "email": "asha@company.com", "password": "••••••••" }
```
**Login response**
```json
{ "data": { "token": "<jwt>", "user": {
  "id": "uuid", "full_name": "Asha R", "email": "asha@company.com",
  "role": "EMPLOYEE", "is_active": true } } }
```

`change-password` request:
```json
{ "current_password": "••••", "new_password": "••••••••" }
```

---

## 3. Users / Employees  `[ADMIN]`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/users` | ADMIN | List users. Filters: `role`, `is_active`. Search: name/email |
| POST | `/api/users` | ADMIN | Create user (role assigned) |
| GET | `/api/users/:id` | ADMIN, self | Get a user |
| PATCH | `/api/users/:id` | ADMIN | Update user details |
| PATCH | `/api/users/:id/status` | ADMIN | Activate / deactivate (`is_active`) |

**Create user**
```json
{ "full_name": "Ravi K", "email": "ravi@company.com",
  "password": "••••••••", "role": "HR" }
```

---

## 4. Projects  `[ADMIN write · members read]`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/projects` | ADMIN, HR (all); EMPLOYEE (member only) | List. Filters: `status`, `is_over_budget`. Search: name/client |
| POST | `/api/projects` | ADMIN | Create project |
| GET | `/api/projects/:id` | ADMIN, HR, member | Get project (with budget utilization) |
| PATCH | `/api/projects/:id` | ADMIN | Update project |
| GET | `/api/projects/:id/members` | ADMIN, HR, member | List project members |
| POST | `/api/projects/:id/members` | ADMIN | Add a member |
| DELETE | `/api/projects/:id/members/:userId` | ADMIN | Remove a member |
| GET | `/api/projects/:id/expenses` | ADMIN, HR | Expenses for project. Filters: `status` |
| GET | `/api/projects/:id/analytics` | ADMIN, HR (read-only) | Spend, utilization, over-budget flag |

**Create project**
```json
{ "name": "Acme Portal", "client_name": "Acme Inc",
  "budget": 500000, "currency": "INR", "status": "ACTIVE" }
```

**Project response (computed fields included)**
```json
{ "data": {
  "id": "uuid", "name": "Acme Portal", "client_name": "Acme Inc",
  "budget": 500000.00, "currency": "INR", "status": "ACTIVE",
  "approved_spend": 312450.00, "budget_utilization": 0.62,
  "is_over_budget": false,
  "created_by": "uuid", "created_at": "...", "updated_at": "..." } }
```

---

## 5. Tasks  `[ADMIN write · assignee status-update]`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/tasks` | ADMIN (all) | List. Filters: `projectId`, `assignee`, `status`, `priority`. Search: title |
| GET | `/api/tasks/my-tasks` | ADMIN, HR, EMPLOYEE | Tasks the user is responsible for (direct or via their department) |
| POST | `/api/tasks` | ADMIN | Create task (assignment: INDIVIDUAL/MULTIPLE/DEPARTMENT) |
| GET | `/api/tasks/:id` | ADMIN (any); HR/EMPLOYEE (responsible) | Get task |
| PATCH | `/api/tasks/:id` | ADMIN | Update task fields |
| PATCH | `/api/tasks/:id/status` | ADMIN (any); HR/EMPLOYEE (responsible, progress-only) | Update status |

**Create task**
```json
{ "project_id": "uuid", "assignee_id": "uuid", "title": "Build login page",
  "description": "...", "priority": "HIGH", "due_date": "2026-07-01" }
```

> EMPLOYEE list/get is **ownership-scoped** to `assignee_id = currentUser`.

---

## 6. Expenses

### 6.1 Core

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/expenses` | ADMIN, HR (all); EMPLOYEE (own) | List. Filters: `status`, `projectId`, `submission_type`, `reimbursement_status`, `from`, `to`. Search: vendor/category |
| POST | `/api/expenses` | EMPLOYEE | Create **cash** expense (manual) → `DRAFT` |
| POST | `/api/expenses/upload` | EMPLOYEE | Create **document** expense (multipart) → `DRAFT`, triggers async AI |
| GET | `/api/expenses/:id` | ADMIN, HR, owner | Get expense (with analysis + document) |
| PATCH | `/api/expenses/:id` | EMPLOYEE owner | Edit/correct fields while `DRAFT` |
| POST | `/api/expenses/:id/submit` | EMPLOYEE owner | Submit → `PENDING_REVIEW` (requires `amount > 0`) |
| DELETE | `/api/expenses/:id` | EMPLOYEE owner | Delete own expense while `DRAFT` only |

**Create cash expense**
```json
{ "project_id": "uuid", "submission_type": "CASH", "vendor": "Local Cafe",
  "amount": 850, "currency": "INR", "expense_date": "2026-06-10",
  "payment_method": "CASH", "category": "Meals", "description": "Team lunch" }
```

**Upload document expense** — `multipart/form-data`
```
file: <binary>            (PDF | PNG | JPG | JPEG, <= 10 MB)
project_id: <uuid>
submission_type: DOCUMENT
```
Response `201` — returns the created expense (`status=DRAFT`) and analysis stub
(`ai_status=PENDING`). The client then **polls** the analysis endpoint (§6.3).

> **Validation:** `project_id` required; non-allowed MIME types → `422`; files
> > 10 MB → `413`/`422`. **One document per expense** (MVP) — re-uploading replaces
> the existing document. For multiple receipts, create multiple expenses.

### 6.2 Documents

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/expenses/:id/documents` | ADMIN, HR, owner | List file metadata |
| GET | `/api/expenses/:id/documents/:docId/url` | ADMIN, HR, owner | **Signed URL** (short-lived) to view the private file |

> Files are private in Firebase. No public URLs are ever returned — only
> time-limited signed URLs generated on demand.

### 6.3 AI Analysis

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/expenses/:id/analysis` | ADMIN, HR, owner | Get AI analysis + `ai_status` (poll target). `404` for CASH expenses |
| POST | `/api/expenses/:id/reprocess` | EMPLOYEE owner, HR | Re-run AI (e.g. after FAILED). **`DRAFT` only**; `409` for CASH or non-DRAFT |

**Analysis response**
```json
{ "data": {
  "expense_id": "uuid", "ai_status": "COMPLETED",
  "vendor": "Amazon", "amount": 1450.00, "date": "2026-06-15",
  "category": "Software", "payment_method": "UPI",
  "confidence_score": 96, "model_version": "kimi-k2.6-vision",
  "error_message": null, "updated_at": "..." } }
```
`ai_status` ∈ `PENDING | PROCESSING | COMPLETED | FAILED | LOW_CONFIDENCE`.
On `FAILED`/`LOW_CONFIDENCE`, the client falls back to manual entry. Confidence
is advisory only. See [AI_PIPELINE.md](./AI_PIPELINE.md).

---

## 7. Approvals  `[HR]`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/approvals/queue` | HR | Expenses where `status=PENDING_REVIEW`. Filters: `projectId`, `from`, `to`. Search: vendor |
| POST | `/api/expenses/:id/approve` | HR | Approve → `APPROVED` + budget rollup |
| POST | `/api/expenses/:id/reject` | HR | Reject → `REJECTED` (remarks required) |
| GET | `/api/approvals/history` | ADMIN, HR | Past decisions (full history; reject/resubmit cycles included). Filters: `decision`, `reviewedBy`, `expenseId`, `from`, `to` |

**Approve**
```json
{ "remarks": "Verified against invoice." }
```
**Reject** (remarks mandatory)
```json
{ "remarks": "Amount does not match receipt." }
```

> Each approve/reject appends a new row to `expense_approvals` (history); the
> latest row is the current decision. A rejected expense can be corrected and
> resubmitted by the owner. HR **cannot** edit expense field values — review only.
> Approving never blocks on budget; if approved spend exceeds the project budget,
> the project is flagged `is_over_budget=true` and a warning is returned in the
> response `meta` (the flag is recomputed/cleared on each approval).

---

## 8. Reimbursements  `[HR · owner read]`

Tracked via fields on `expenses` (no separate resource collection).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/reimbursements` | HR, ADMIN | List APPROVED expenses by `reimbursement_status`. Filters: `reimbursement_status`, `projectId` |
| PATCH | `/api/expenses/:id/reimbursement` | HR, ADMIN | Update reimbursement status/date/reference |

**Update reimbursement**
```json
{ "reimbursement_status": "PAID", "reimbursement_date": "2026-06-20",
  "reimbursement_reference": "NEFT-558210" }
```
`reimbursement_status` ∈ `NONE | PENDING | PROCESSING | PAID`. Updates allowed only
when `expenses.status = APPROVED` (system sets `NONE → PENDING` on approval; HR/ADMIN
advance `PENDING → PROCESSING → PAID`).

---

## 9. Dashboards & Analytics

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/api/dashboard` | any | Role-scoped dashboard payload (shape varies by role) |
| GET | `/api/analytics/expenses` | ADMIN, HR (read-only) | Expense analytics. Filters: `from`, `to`, `groupBy=category|project|month` |
| GET | `/api/analytics/projects` | ADMIN, HR (read-only) | Project analytics (spend, utilization, over-budget) |

> HR has **read-only** access to analytics, expense metrics, and approval metrics.
> HR cannot modify budgets or administrative settings.

**Dashboard payloads (by role)**
- **ADMIN:** `total_employees`, `active_projects`, `monthly_expenses`, `budget_utilization`, expense & project analytics.
- **HR:** `pending_reviews`, `approved_count`, `rejected_count`, review metrics.
- **EMPLOYEE:** `assigned_projects`, `pending_tasks`, `submitted_expenses`, approval/reimbursement status.

---

## 10. RBAC + Ownership Matrix

Legend: ✅ full · 🔸 own/assigned/member only · ❌ none.

| Resource / action | ADMIN | HR | EMPLOYEE |
|---|---|---|---|
| Users — manage | ✅ | ❌ (self read) | ❌ (self read) |
| Projects — create/edit | ✅ | ❌ | ❌ |
| Projects — read | ✅ | ✅ | 🔸 member |
| Project members — manage | ✅ | ❌ | ❌ |
| Tasks — create/edit | ✅ | ❌ | ❌ |
| Tasks — read | ✅ | ✅ | 🔸 assignee |
| Tasks — update status | ✅ | ❌ | 🔸 assignee |
| Expenses — create | ❌ | ❌ | ✅ (own) |
| Expenses — read | ✅ | ✅ | 🔸 own |
| Expenses — edit (DRAFT) | ❌ | ❌ | 🔸 own |
| Expenses — delete (DRAFT) | ❌ | ❌ | 🔸 own |
| AI analysis — read | ✅ | ✅ | 🔸 own |
| AI reprocess (DRAFT) | ❌ | ✅ | 🔸 own |
| Approve / reject (no field edit) | ❌ | ✅ | ❌ |
| Reimbursement — update | ✅ | ✅ | ❌ (own read) |
| Analytics / metrics — read | ✅ | ✅ (read-only) | 🔸 own summary |

**Enforcement**
- **RBAC middleware:** `requireAuth`, `requireAdmin`, `requireHR`, `requireEmployee`, `requireRole([...])`.
- **Ownership checks** in services: verify `submitted_by`/`assignee_id`/project
  membership equals the current user before returning or mutating a resource.
- JWT payload: `{ sub, role, iat, exp }`. Deactivated users (`is_active=false`)
  are rejected at auth time.
- **Secrets** (JWT secret, NVIDIA API key, Firebase credentials) are read from
  **environment variables only**.

---

## 11. Validation Rules (server-side)

| Field | Rule |
|---|---|
| `email` | unique, valid format |
| `role` | one of `ADMIN/HR/EMPLOYEE` |
| `budget` | numeric ≥ 0 |
| `amount` | numeric ≥ 0 in `DRAFT`; **must be > 0 at submit** |
| `currency` | 3-letter ISO, default `INR` |
| `project_id` (expense) | required (every expense belongs to a project) |
| task `assignee_id` | must be a member of the task's project |
| file `type` | `PDF/PNG/JPG/JPEG` only |
| file `size` | ≤ 10 MB |
| documents per expense | exactly one (MVP); re-upload replaces |
| reject `remarks` | required when rejecting |
| reimbursement update | HR/ADMIN only; only when expense `APPROVED` |
| `reprocess` | `DRAFT` + `DOCUMENT` expenses only |
| list `limit` | ≤ 100 |

---

## 12. Rate Limiting

- Global per-IP/user rate limit on all endpoints.
- Tighter limit on `POST /api/expenses/upload` and `/reprocess` to control AI cost.
