# OpsFlow — Pre-Phase-3 Stabilization & UX Audit Report

Date: 2026-06-16

Scope: stability, data consistency, validation, UX. No Expense Management, no AI.

---

## 1. User Model Improvements

- **Added `position` (designation)** to the user model — a concept **separate from
  `role`** (access level). Backend: `UserDocument` + `PublicUser` + create/update
  service + Zod schemas; never confused with `role`.
- **Department validation** — `department` and `position` are now validated
  (`optionalShortText`: trimmed, max 100 chars, blank/whitespace normalized to
  "unset") instead of being unvalidated free text.
- **Designation displayed in**:
  - **User List** — new "Position" column.
  - **User Details / Edit** — new "Position" field in the user form.
  - **Profile View** — new `/profile` page (see §4) shows role, position, department.
  - **Project Member Lists** — each member now shows `Position · email`.

Verified live: create/get/update round-trip `position`; over-length rejected
(400); blank department/position normalized away (6/6 checks).

## 2. Data Refresh (query invalidation / refetching)

Audited every CRUD workflow for auto-refresh without manual reload:

| Entity | Create | Update | Delete |
|---|---|---|---|
| Users | navigate → list refetch + toast | navigate → list refetch + toast | (no delete; status via edit) |
| Projects | navigate → details refetch + toast | navigate → details refetch + toast | (no delete) |
| Project Members | refetch on assign | — | refetch on remove |
| Tasks | refetch on create | refetch on edit / status | — |

**State-sync bug fixed:** on the admin Project Details page, the **Members
table, Tasks table, and Kanban board each fetched independently**, so creating a
task (table) or moving a card (board) left the others stale until reload. Added a
shared `dataVersion` coordinator: any mutation in any of the three now refetches
all three (`refreshKey` + `onMutated` props). The Kanban also keeps its
optimistic in-place update for instant feedback.

## 3. UX Audit

- **Loading / Empty / Error states** — already standardized via
  `LoadingState` / `EmptyState` / `ErrorState`; applied them to the new Profile
  page too.
- **Success notifications** — added missing success toasts for **user** and
  **project** create/edit (Members and Tasks already toasted), so all mutations
  now confirm consistently.
- **Form validation messages** — client-side validation + server Zod errors
  surfaced inline; added `maxLength` hints and clearer placeholders on the new
  Position/Department fields.

## 4. Bug Audit

**Bugs fixed**
- **Dead menu items** — the topbar "My Profile" and "Settings" did nothing.
  Removed "Settings"; wired "My Profile" to a real `/profile` page.
- **Placeholder profile** — Employee "My Profile" pointed at a `ModulePlaceholder`.
  Replaced with a real `ProfilePage` (`GET /users/me`) reachable by **all roles**
  (`/profile`, any authenticated user); removed the dead `/employee/profile` route.
- **State synchronization** — Members/Tasks/Kanban now refresh together (§2).
- **Missing validation** — `department`/`position` now validated; `position`
  added to strict Zod create/update bodies.
- **Missing success feedback** — user/project mutations now toast.

**Reviewed, no change needed**
- **Broken routes** — every sidebar item resolves to a route (real or
  placeholder); breadcrumbs/links verified.
- **RBAC** — re-confirmed: projects/tasks/members enforce ADMIN/HR/EMPLOYEE
  correctly; budget hidden from HR/Employee; employees see only their own
  tasks/projects; HR is view-only on tasks; `/profile` is self-scoped via
  `GET /users/me`.

## 5. Remaining Recommendations

- **Bundle size** (~650 kB) — add route-level `React.lazy()` code-splitting.
- **Department as managed list** — currently validated free text; consider a
  curated department/position catalog if standardization is required.
- **Consolidate task views** — the admin Project Details page shows a Tasks
  *table* and a Kanban *board*; consider tabs to reduce redundancy.
- **Cross-client real-time** — current "real-time" is per-client (optimistic +
  refetch). True multi-user live updates would need websockets/polling.
- **Automated tests** — only the auth/logout flow is covered; add component/
  integration tests for users/projects/tasks/kanban.
- **Self-service profile editing** — Profile is read-only by design (role/position
  are admin-controlled); a limited self-edit (e.g., name) could be added later.
- **Cleanup** — `next-themes` remains in `package.json` (pulled in with `sonner`)
  but is unused after rewiring the toaster to the app's ThemeProvider.
- **Production hardening** (carried from the security audit) — configure
  `trust proxy`, a shared rate-limit store, and remove demo/debug endpoints.

## Verification

- Backend: `tsc --noEmit` clean; live HTTP checks for position/department 6/6.
- Frontend: `npm run build` ✅, `npm run lint` ✅, `vitest` 4/4 ✅.
