# Design: Admin Tasks Module, Search Privacy Hardening & Backend-Enforced Date Filters

**Date:** 2026-06-24
**Branch:** feat/ai-first-expense-submission (or a new branch off main)
**Status:** Approved in brainstorming; pending written-spec review

## Context

Three high-priority blockers were raised, gating further feature work. A six-pass
codebase audit (task/nav structure, search RBAC, date-filter wiring, search
suggestions/cache/logout, exports/notifications/help-desk, version/milestone
entities) established the *actual* state, which differs from the reported symptoms
in important ways. This spec is grounded in those findings.

### What the audit found (reality vs. reported symptom)

1. **Tasks** are project-scoped at every layer. `projectId` is required in the TS
   types (`backend/src/types/task.types.ts:18`), the Zod schema
   (`backend/src/validation/task.schema.ts:17`), and the service even enforces
   "assignee must be a project member" (`task.service.ts:138`). There is no
   top-level Tasks nav item — creation is reachable only inside a project or via
   the admin-only `QuickCreateTaskDialog` (which still forces a project pick).

2. **Search** backend RBAC is **correct**. `search.service.ts:51-141` scopes every
   entity by role (Admin=all, HR=HR-scope, Employee=own) and returns trimmed DTOs
   (`id/title/code/status` only — no amounts, salary, or notes). There are **no**
   suggestions/autocomplete and **no** persistent result caches (no react-query/SWR;
   results live only in component state and clear on modal close). The genuine
   defects are privacy/isolation bugs in client-side storage:
   - Recent searches use a **shared, non-user-scoped** localStorage key
     `"opsflow.search.recent"` (`GlobalSearch.tsx:44`).
   - Logout (`clearAuth` in `frontend/src/lib/storage.ts:29-32`) **does not clear**
     recent searches, so the next user on the same browser sees the prior user's
     history (entity codes/titles/status they may not be authorized to see).
   - The same un-scoped pattern affects `"opsflow.onboarding.employee"`
     (`EmployeeGettingStarted.tsx:8`) — lower severity (UX, not data) but same family.

3. **Date filters** render and *appear* to work, but filter **client-side only** on
   a fully-loaded dataset via `filterByDate` (`DateRangeFilter.tsx`, used in ~14
   locations). The selected range is **never** sent to the backend; no endpoint
   accepts date params; no query filters by date. Server-derived KPIs (Reports
   overview/projects/AI) therefore cannot be date-scoped at all. The Reports backend
   even left a comment reserving room for `from/to` that was never implemented
   (`reports.schema.ts:3-6`). Exports are client-side and emit the in-memory
   *filtered* rows (`expenses-csv.ts`, `ExpensesOverviewPage.tsx:141-148`), so they
   already track active filters — but only because the data was loaded in full.

### Decisions locked in brainstorming

- **Tasks:** top-level **Admin-only** module. Project stays **required** (picker is
  front-and-center; "no dependency" = no longer buried inside Projects). **Create
  Task is a primary action, not a tab.**
- **Search:** treat recent-search leakage and visibility as a **security/privacy**
  issue, not just UX. Scope is the confirmed storage bugs (backend RBAC is already
  correct and verified).
- **Date filters:** **backend-enforced**, using **in-memory filtering** (no Firestore
  composite indexes — consistent with the existing `getExpensesReport` pattern and
  avoids index-deploy friction). Charts, KPIs, tables, exports, and reports must all
  derive from the **same filtered dataset**.
- **Version filtering:** apply **where applicable** — only `Task.version` exists
  (free-text); wire it into the new Tasks module + backend `ListTasksParams`.
- **Date-filter rollout** additionally includes **notifications, help-desk tickets,
  exports, and task analytics**.

## Goals

- A first-class Admin **Tasks** module (Dashboard, List, Analytics + a primary
  "Create Task" action) reachable from top-level nav.
- Close the search privacy leaks (per-user recent-search storage, logout clearing,
  user-scoped onboarding flag) with regression tests.
- Make the date-range filter **authoritative**: the backend filters by range and the
  frontend renders/exports that single filtered dataset, across dashboards, reports,
  tasks, expenses, reimbursements, projects, departments, activity, notifications,
  help-desk tickets, and exports.
- **Always show the active range** near the page title and in exports, so users
  never view a date-scoped screen without knowing the scope.
- Optional `version` filtering on the Tasks module (frontend + backend).

## Non-Goals

- Making `projectId` optional / standalone tasks (explicitly rejected).
- Firestore composite indexes / query-level range filtering (deferred; in-memory now).
- Server-side streamed export endpoints (the existing client-side export over the
  filtered dataset is sufficient for this scope).
- Reworking backend search RBAC (audited as correct).
- New milestone/release/sprint entities (none exist; only `Task.version`).

---

## Shared foundation: the date-range contract

A single contract every date-aware surface adheres to, defined once.

### Frontend

- `DateRangeFilter` already yields a `DateRange` from a preset
  (All time, Today, Last 7/30 days, Last quarter, Last 6 months, Last year, Custom).
- Add a helper (e.g. `rangeToParams(range): { from?: string; to?: string }`) in the
  date utils module that converts the active range to ISO `from`/`to` query params.
  `"all time"` omits both.
- The page passes `{ from, to }` into its API call and includes them in the fetch's
  dependency array, so changing the range **refetches** from the backend.
- The now-redundant client-side `filterByDate` is **removed** on pages where the
  backend takes over (no double filtering / single source of truth). Pages keep a
  single `visible`/`dated` array that charts, KPIs, tables, **and exports** all read
  from.

### Backend

- Each affected endpoint adds **optional** `from`/`to` to its Zod query schema
  (ISO date strings; `to` is inclusive end-of-day).
- The service applies an **in-memory date-window filter** on the entity's primary
  date field after fetching, mirroring the existing
  `getExpensesReport` "trailing-window filter in memory (avoids the composite-index
  range query)" pattern (`reports.service.ts:110-111`).
- A small shared helper (e.g. `withinRange(value, from, to)`) keeps the window logic
  consistent across services.

### Primary date field per entity

| Area | Date field |
|------|-----------|
| Expenses / Reimbursements / Pending reviews | `expenseDate` |
| Reports (overview/expenses/projects/ai + derived tabs) | `expenseDate` |
| Tasks (list/dashboard/analytics) | `dueDate` |
| Projects | `createdAt` |
| Departments | derived from member/expense dates already in use |
| Notifications | `createdAt` |
| Help-desk tickets | `createdAt` |
| Activity feed | event timestamp (derive-on-read) |

---

## Workstream 1: Admin Tasks module

### Navigation

- Add a `Tasks` item to the **Admin** array in `frontend/src/lib/navigation.ts`
  (icon `ClipboardList`, already imported), routed at `/admin/tasks`.
- Optionally surface in the admin mobile bottom nav if a slot is warranted
  (follow `bottomNavByRole` patterns; not required).

### Routes & pages

`/admin/tasks` renders an `AdminTasksPage` workspace (mirrors the Reports workspace
pattern) with tabs **Dashboard | List | Analytics**. **Create Task is NOT a tab** —
it is a primary action available as:

- A prominent **"New Task"** button in the page header (and the existing
  `AppTopbar` admin "New Task" button, verified wired), and
- A **Dashboard quick action** card.

Create opens the existing `QuickCreateTaskDialog` (project picker front-and-center;
project remains required). No new create surface/route is needed beyond promoting
this dialog to a primary action.

- **Dashboard** (index): task KPIs (counts by status & priority, overdue, due-soon),
  the "New Task" quick action, and a recent-tasks list. Honors the date range and
  (optional) version filter.
- **List**: all tasks via `GET /tasks` (Admin), with search + status + priority +
  date-range + **version** filters; table↔card responsive per existing mobile
  patterns.
- **Analytics**: aggregate charts (status distribution, per-project load, throughput,
  overdue trend), date-scoped, with CSV export over the same filtered dataset.

### Backend

- No data-model change. `GET /tasks` gains `from`/`to` (date contract, on `dueDate`)
  and `version` (see Workstream: version filtering) in `listTasksQuery` and
  `ListTasksParams`, applied in-memory in `task.service.ts`.

---

## Workstream 2: Search privacy hardening

Surgical, security-framed fixes. Backend unchanged (RBAC verified correct).

1. **Per-user recent searches.** In `GlobalSearch.tsx`, key recent searches by the
   authenticated user id: `opsflow.search.recent.<userId>` instead of the shared
   static key. On load, **delete the legacy global key** `opsflow.search.recent` so
   already-leaked data is purged from existing browsers.
2. **Clear on logout.** Extend `clearAuth()` in `frontend/src/lib/storage.ts` to
   remove the recent-search key(s) (and clear them on the 401 interceptor path,
   which already calls `clearAuth`). This is the central choke point both logout and
   token-expiry flow through.
3. **User-scope the onboarding flag.** Change `EmployeeGettingStarted.tsx` storage
   key to `opsflow.onboarding.employee.<userId>` so one user's dismissal doesn't
   suppress another's checklist (isolation parity).
4. **Tests.** Extend `frontend/src/test/logout.test.tsx` to assert recent searches
   are cleared on logout; add a test that recent searches written under user A are
   not readable as user B.

Explicitly **not** changing: backend search filtering, result DTO shape, or adding
server-side autocomplete (none exists and none is requested).

---

## Workstream 3: Backend-enforced date filtering

Apply the date contract per area. For each: add `from`/`to` to the query schema →
window-filter in the service → send the range from the frontend → drop the redundant
client-side `filterByDate` → ensure charts/KPIs/tables/**exports** all read the one
filtered array.

- **Reports** (largest payoff): `overview`, `expenses`, `projects`, `ai`, and the
  derived `departments`/`employee`/`reimbursement`/`audit` tabs compute over the
  range **server-side**. Replace the `months`-only param with `from`/`to`; the
  `months` param is removed (frontend reports-api wrapper and all callers updated in
  the same change).
- **Dashboards:** Admin / HR / Employee.
- **Expenses, Reimbursements, Pending reviews:** on `expenseDate`.
- **Tasks:** on `dueDate` (ties into Workstream 1).
- **Projects, Departments:** on `createdAt` / relevant date.
- **Activity feed:** derive-on-read — apply the window to the derived events in the
  read path (no activity collection exists; do not introduce one).
- **Notifications:** add `from`/`to` to `GET /notifications`; window-filter in
  `listForUser` (already an in-memory pass — no index needed).
- **Help-desk tickets:** add `from`/`to` to `GET /tickets`; window-filter in
  `listAllTickets` / `listTicketsForUser` (already in-memory — no index needed).
- **Exports:** no dedicated work beyond ensuring each export reads the same
  `visible`/filtered array the tables/charts use. Because exports already emit
  in-memory filtered rows, this falls out of the single-dataset rule above.

### Active range always visible (cross-cutting requirement)

Every date-filtered screen must **visibly display the active range** near the page
title so users always know whether they're viewing Today, Last 30 Days, Last Quarter,
a Custom Range, etc. Hidden filters erode trust in reports.

- Add a small, reusable range-label component (e.g. `ActiveRangeBadge`) that renders
  the current preset's human label, and for custom/explicit ranges the resolved
  dates (e.g. "Custom: 1 Jan – 31 Mar 2026"). `"All time"` renders as "All time".
- Place it adjacent to the page/section title (and within the Reports workspace
  header), driven by the same `DateRange` state that feeds the query.
- **Exports must carry the range too:** include the active range in the export
  filename and/or a header row (e.g. `expenses_last-30-days_2026-06-24.csv`, and a
  leading "Range: Last 30 days (26 May – 24 Jun 2026)" line in CSVs / print header in
  PDFs) so an exported artifact is self-describing.
- Derive the label from a single formatter shared with `rangeToParams` so the badge,
  the query, and the export never disagree.

### Single filtered dataset (cross-cutting requirement)

On every date-aware page, there is exactly **one** filtered dataset derived from the
backend response. Charts, KPIs, summary tables, and the export button all read from
it. No component re-derives from an unfiltered source, and no export re-fetches "all"
data. This is the explicit acceptance criterion for "charts, KPIs, tables, exports,
and reports all derive from the same filtered dataset."

---

## Workstream 4: Version filtering (where applicable)

Only `Task.version` exists (free-text, optional, max 40 chars; already filtered
client-side on the Kanban view). No project/milestone/release/sprint entities.

- **Backend:** add optional `version` to `listTasksQuery` and `ListTasksParams`;
  filter in-memory in `task.service.ts`.
- **Frontend:** add a version `Select` to the Tasks **List** (and optionally
  **Analytics**), populated from the distinct versions present in the dataset
  (reuse the Kanban approach: `[...new Set(tasks.map(t => t.version).filter(Boolean))]`).
- Conditionally render the version filter only when versions exist (matches the
  Kanban toolbar behavior).

---

## Testing strategy

- **Backend (unit):** for each service gaining `from`/`to`, test that the window
  filter includes/excludes boundary dates correctly and that omitting params returns
  all rows. Test `version` filter on tasks. Test that `to` is inclusive end-of-day.
- **Backend (validation):** schemas accept valid ISO `from`/`to`, reject malformed,
  and treat both as optional.
- **Frontend (unit):** `rangeToParams` maps each preset correctly; `"all time"`
  omits params; custom range round-trips.
- **Frontend (component):** changing the date filter triggers a refetch (params
  present in the request); the export button emits the filtered dataset.
- **Search privacy:** logout clears recent searches; recent searches are
  per-user-isolated; legacy global key is purged on load.
- **Manual smoke:** verify a date change visibly rescopes a Reports KPI (server-side)
  — the case client-side filtering could never satisfy.

## Risks & tradeoffs

- **In-memory filtering scales with collection size.** Acceptable at current scale
  and consistent with existing code; if collections grow large, revisit Firestore
  range queries + composite indexes (deferred, noted as a non-goal). The backend
  still fetches the candidate set before windowing — same cost profile as today.
- **Removing client-side `filterByDate`** must be done per-page in lockstep with
  wiring the backend params, or a page could momentarily show unfiltered data.
  Mitigation: change each page atomically (params + fetch + remove client filter +
  point export at the filtered array in one edit).
- **Reports `months` → `from`/`to` migration** changes the API contract; ensure the
  frontend reports-api wrapper and all callers are updated together.

## Out of scope (restated)

Standalone/project-less tasks; Firestore composite indexes; server-side streamed
exports; backend search RBAC changes; new milestone/release entities.
