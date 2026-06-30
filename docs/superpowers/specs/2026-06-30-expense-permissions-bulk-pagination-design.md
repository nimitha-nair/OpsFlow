# Expenses: Capability-based permissions, admin submit, bulk upload, pagination

Date: 2026-06-30
Branch: `feat/ai-first-expense-submission`
Status: Approved (design)

## Problem

Four issues in the expense / reimbursement module:

1. **Admin cannot submit their own expenses.** Submitting is hard-locked to the
   `EMPLOYEE` role on both backend (`authorize(UserRole.EMPLOYEE)` on `POST
   /expenses` and all draft/submit/analyze routes) and frontend (the whole
   submission UI lives only under the `/employee` route tree). An admin cannot
   reach it.
2. **No bulk upload.** You can attach up to 5 receipts to *one* expense, but
   there is no "many receipts → many expenses" flow.
3. **No pagination.** Only the (unused) admin `GET /expenses` endpoint
   paginates; every list page fetches all docs and filters in the browser.
4. **Access is not permission-based.** RBAC is purely role-list per route
   (`authorize(...roles)`); there is no capability/permission map.

## Decisions (from brainstorming)

- Permission model: **a real capability layer** (named capabilities mapped to
  roles), not just adding ADMIN to allow-lists.
- Bulk upload: **N receipts → N draft expenses**, each AI-analyzed
  independently, reusing the existing AI-first pipeline.
- Admin's own-expense approval path: **same as employee** — DRAFT → SUBMITTED →
  HR review → APPROVED/REJECTED. No workflow change.
- Pagination: **page-based on all expense lists**, server-side filtering then
  slicing (consistent with current in-memory + 30s-cache model).
- Defaults for open questions: HR also gets `expense:create` /
  `expense:bulk-upload` (HR staff have their own expenses); bulk cap = **15**
  files per batch.

## 1. Capability layer (issue #4)

### Backend

New `backend/src/types/permissions.ts`:

- `Capability` union / enum:
  - `expense:create`, `expense:submit`, `expense:bulk-upload`,
    `expense:edit-own`, `expense:delete-own`, `expense:view-own`,
    `expense:view-all`, `expense:review`, `expense:reimburse`.
- `ROLE_CAPABILITIES: Record<UserRole, Capability[]>` — single source of truth:
  - `EMPLOYEE`: create, submit, bulk-upload, edit-own, delete-own, view-own
  - `HR`: create, submit, bulk-upload, edit-own, delete-own, view-own,
    view-all, review
  - `ADMIN`: everything EMPLOYEE has + view-all + reimburse
- `hasCapability(role, cap): boolean` helper.

New middleware in `backend/src/middleware/rbac.middleware.ts`:

- `requirePermission(cap: Capability)` — 401 if no `req.user`, 403 "Insufficient
  permissions" if `!hasCapability(req.user.role, cap)`. Mirrors existing
  `authorize` ergonomics.

Expense routes (`backend/src/routes/expense.routes.ts`) switch from
`authorize(UserRole.X)` to `requirePermission(Capability.Y)`:

| Route | Old guard | New capability |
|---|---|---|
| `POST /` | EMPLOYEE | `expense:create` |
| `PATCH /:id` | EMPLOYEE | `expense:edit-own` |
| `POST /:id/submit` | EMPLOYEE | `expense:submit` |
| `DELETE /:id` | EMPLOYEE | `expense:delete-own` |
| `POST /:id/documents` | EMPLOYEE | `expense:create` |
| `DELETE /:id/documents/:docId` | EMPLOYEE | `expense:edit-own` |
| `POST /:id/analyze` | EMPLOYEE | `expense:create` |
| `PATCH /:id/analysis` | EMPLOYEE | `expense:edit-own` |
| `GET /my-expenses` | EMPLOYEE | `expense:view-own` |
| `POST /bulk-drafts` (new) | — | `expense:bulk-upload` |
| `GET /pending`, `PATCH /:id/review`, `/:id/approve`, `/:id/reject` | HR | `expense:review` |
| `GET /reimbursements`, `GET /review` | HR+ADMIN | `expense:view-all` |
| `PATCH /:id/reimbursement` | ADMIN | `expense:reimburse` |
| `GET /projects-spending`, `/project/:projectId`, `GET /` | ADMIN | `expense:view-all` |

Ownership checks in the service layer (`employeeId !== userId` → 403) are
unchanged. `createExpense` keeps forcing `employeeId = req.user.userId`, so any
permitted role creates *their own* expense.

Scope: only the expense module migrates now. Other modules keep `authorize()`.

### Frontend

New `frontend/src/lib/permissions.ts`:

- Mirror of `ROLE_CAPABILITIES` (same capability strings).
- `can(role, capability): boolean` and a `useCan()` hook reading `useAuth()`.

UI uses `can(...)` instead of role-equality to show/hide controls and gate
routes.

## 2. Admin submit (issue #1)

- Make the submission flow pages role-relative: derive the base path from the
  logged-in user's role instead of hardcoding `/employee/...`. Affected:
  `SubmitExpensePage`, `AnalysisReviewPage`, `ExpenseVerificationPage`, and
  links in `MyExpensesPage`. Introduce a small `expensesBasePath(role)` helper
  (e.g. `/employee/expenses` vs `/admin/expenses`).
- Register the submission + bulk routes under the admin route tree too
  (`App.tsx`), gated by `can(role,'expense:create')` /
  `'expense:bulk-upload'`.
- Add "Submit Expense" and "Bulk Upload" entry points on
  `ExpensesOverviewPage` (admin), capability-gated.
- Admin's own expenses appear in HR's pending queue automatically (just another
  expense doc). No backend workflow change.
- Known/accepted: admin still marks reimbursement via the admin-only
  capability, including potentially their own — matches the existing model.

## 3. Bulk upload (issue #2)

### Backend

- New `POST /expenses/bulk-drafts` (guarded by `expense:bulk-upload`). Accepts up
  to 15 files. For each file: create one DRAFT expense (`type: DOCUMENT`,
  placeholders like the AI-first single flow) and attach that one file to it.
  Returns the list of created drafts (`{ data: Expense[] }`).
- Reuses existing `createExpense` + document-attach service code; no new AI code
  here.
- Multer config: a bulk variant allowing up to 15 files (existing single-expense
  cap stays at `MAX_DOCS = 5`).

### Frontend

- New `BulkUploadPage` (route under employee + admin trees, capability-gated):
  drag/drop many receipts, call `bulk-drafts`, then run the existing per-draft
  `postAnalyze` with limited concurrency (e.g. 3 at a time). Per-file progress
  list: creating → analyzing → ready / failed (failed items remain editable
  drafts).
- After analysis, show the created drafts for review/verify; user submits each
  (or "submit all ready"). Each draft follows the normal submit → HR review
  path.

## 4. Pagination (issue #3)

### Backend

Extend the existing `page`/`limit` slicing pattern (already in
`listApprovedExpenses`) to `my-expenses`, `review`, `pending`,
`reimbursements`. Apply status / date-window / search filters **server-side
before slicing**, so paging is correct. Stays in-memory-after-fetch, consistent
with the 30s read cache and the Firestore free-tier quota.

Each list endpoint returns:

```
{ data: Expense[], pagination: { page, limit, total, totalPages } }
```

`page` defaults to 1, `limit` defaults to 20 (validated, capped).

### Frontend

- Shared `Pagination` control (Prev / Next + "Page X of Y", 20/page).
- Wire into `MyExpensesPage`, `ExpensesOverviewPage`, `PendingReviewsPage`,
  `ReimbursementsPage`. Move page + filter state into query params so the server
  does the filtering; remove the now-redundant client-side full-list filtering
  on these pages.

## Approaches considered & rejected

- **True Firestore cursor pagination** — overkill; breaks the cache and
  currency-grouping model that relies on having the working set in memory.
- **Pure client-side pagination** — does not reduce payload; defeats the purpose
  at scale.
- **Bulk endpoint that runs AI inline** — AI is slow/async; better to create
  drafts fast then analyze per-draft via the proven pipeline.

## Testing

- Backend unit tests: `requirePermission` (allow/deny per role), capability map
  invariants, `bulk-drafts` (creates N drafts, attaches files, rejects > 15,
  enforces capability), pagination shape + filter-before-slice correctness for
  each list endpoint.
- Frontend: `can()` truth table; capability-gated rendering of submit/bulk entry
  points; pagination control behavior. Manual verification of admin submit and
  bulk flow end-to-end.

## Out of scope

- Migrating non-expense modules to capabilities.
- CSV/spreadsheet import (only receipt-based bulk).
- Changing who reimburses / separation-of-duties on reimbursement.
