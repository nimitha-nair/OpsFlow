# Date-Filter Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the date-range filter authoritative across every data surface — backend filters by range (in-memory), the frontend sends the range and renders one backend-filtered dataset, and every screen shows the active range near its title and in exports.

**Architecture:** Reuses the Date-Range Foundation (Plan 2): frontend `rangeToParams`/`rangeLabel`/`rangeSlug`/`ActiveRangeBadge`; backend `dateRangeQuery` Zod fragment + `filterByDateWindow`. Each surface task: (a) `.merge(dateRangeQuery)` into its query schema, (b) `filterByDateWindow(rows, getDate, from, to)` in the service, (c) send `rangeToParams(range)` from the page and add it to the fetch deps so it refetches, (d) drop the now-redundant client-side `filterByDate`, (e) render `<ActiveRangeBadge range={range} />` by the title and use `rangeSlug` in export filenames.

**Tech Stack:** React + TS (Vite), Vitest, Express, Zod, Firestore (firebase-admin).

## Global Constraints

- In-memory filtering only — NO Firestore composite indexes / range `where()`.
- `from`/`to` are inclusive ISO datetime strings; "all time" sends neither.
- A screen's charts, KPIs, tables, AND exports read ONE backend-filtered dataset — no component re-derives from an unfiltered source; no export re-fetches "all".
- The active range MUST be visible near each screen's title (`ActiveRangeBadge`) and reflected in export filenames (`rangeSlug`).
- Preserve existing RBAC on every endpoint (do not change `authorize(...)`).
- Frontend tests: `npx vitest run <path>` (from `frontend/`). Backend tests + typecheck: `npx vitest run <path>` and `npm run typecheck` (from `backend/`).
- Foundation APIs (already shipped): `rangeToParams(range)→{from?,to?}`, `rangeLabel`, `rangeSlug`, `<ActiveRangeBadge range/>`, backend `dateRangeQuery`, `filterByDateWindow(items,getDate,from?,to?)`, `withinIsoRange`.

---

## Reference slice: Reports (Tasks R1–R2)

The Reports module is the hardest case — server-derived KPIs plus most tabs are
fed by the expenses **review** endpoint (`listReviewExpenses("ALL")`). So the
slice converts both the dedicated `/reports/*` endpoints and the expense review
endpoint to accept `from`/`to`. Other surfaces follow the same pattern and may
reference R1/R2's commits as the template.

### Task R1: Reports + expense-review backend accept `from`/`to`

**Files:**
- Modify: `backend/src/validation/reports.schema.ts` — replace `months` with `dateRangeQuery` on `overviewQuery`, `expensesQuery`, `projectsQuery`, `aiQuery` (merge the fragment; drop `months`).
- Modify: `backend/src/validation/expense.schema.ts:93-95` — `reviewExpensesQuery` merges `dateRangeQuery`.
- Modify: `backend/src/controllers/reports.controller.ts` — read `{from,to}` from `req.valid.query`, pass to services.
- Modify: `backend/src/controllers/expense.controller.ts` — review handler reads `{from,to}`, passes to `listReviewExpenses`.
- Modify: `backend/src/services/reports.service.ts` — `getOverviewReport`, `getExpensesReport`, `getProjectsReport`, `getAiAnalyticsReport` each take `(from?: string, to?: string)` and apply `filterByDateWindow` on the row's `expenseDate` (AI: analysis rows on their `createdAt`/linked expense). Remove the `months`-derived window in `getExpensesReport`; the monthly-trend bucketing still works off the filtered rows (derive the bucket span from `from..to`, defaulting to all rows when unbounded).
- Modify: `backend/src/services/expense.service.ts` — `listReviewExpenses(status, from?, to?)` applies `filterByDateWindow` on `expenseDate`.
- Modify: `backend/src/types/reports.types.ts` — `ExpensesReport.range` becomes `{ from: string | null; to: string | null }` (drop `months`).
- Test: `backend/src/services/reports.service.test.ts` (extend if present, else create) — window filtering includes/excludes by `expenseDate`; unbounded returns all.

**Interfaces:**
- Consumes: `dateRangeQuery` (`validation/common.ts`), `filterByDateWindow` (`utils/date-window.ts`).
- Produces: service signatures `getOverviewReport(from?, to?)`, `getExpensesReport(from?, to?)`, `getProjectsReport(from?, to?)`, `getAiAnalyticsReport(from?, to?)`, `listReviewExpenses(status, from?, to?)`.

- [ ] **Step 1 (TDD):** Write failing service tests asserting that, given seeded expenses across dates, `getOverviewReport(from,to)` and `getExpensesReport(from,to)` count only in-window rows, and unbounded returns all. Use the existing Firestore test harness/mocks in the backend test suite (match how other `*.service.test.ts` files mock `db`).
- [ ] **Step 2:** Run tests → fail.
- [ ] **Step 3:** Merge `dateRangeQuery` into the four reports schemas + `reviewExpensesQuery`; thread `from`/`to` through the controllers; apply `filterByDateWindow` in the five service functions; update `ExpensesReport.range`. Keep RBAC and existing response shapes otherwise unchanged.
- [ ] **Step 4:** Run the new tests + `npx vitest run` (full backend) + `npm run typecheck` → all pass.
- [ ] **Step 5:** Commit `feat(dates): reports + expense-review endpoints filter by from/to`.

### Task R2: Reports frontend sends range, renders one filtered dataset + badge

**Files:**
- Modify: `frontend/src/lib/reports-api.ts` — each function takes `params: { from?: string; to?: string } = {}` and passes it as axios `params` (drop the `months` arg).
- Modify: `frontend/src/lib/expenses-api.ts` — `listReviewExpenses(status, params?: {from?,to?})` forwards the range.
- Modify: `frontend/src/components/reports/ReportsWorkspace.tsx` — compute `const params = rangeToParams(range)`; pass to all four report loaders + `listReviewExpenses("ALL", params)`; add `range` to the `load()` effect deps so it refetches on change; remove the client-side `filterByDate(data.records, …)` (records are now server-filtered); render `<ActiveRangeBadge range={range} />` next to the workspace title; use `rangeSlug(range)` in every export filename (e.g. `audit-flags_${rangeSlug(range)}_${stamp}.csv`).
- Modify: `frontend/src/components/reports/HrInsightsDashboard.tsx` — same wiring for its own `range` (send params to its data calls, badge by title, `rangeSlug` in exports).

**Interfaces:**
- Consumes: `rangeToParams`, `rangeSlug` (`@/lib/date-range`), `ActiveRangeBadge` (`@/components/common/ActiveRangeBadge`), updated `reports-api`/`expenses-api`.

- [ ] **Step 1:** Update `reports-api.ts` + `expenses-api.ts` signatures (send params).
- [ ] **Step 2:** Wire `ReportsWorkspace` + `HrInsightsDashboard`: refetch on range change, remove redundant client filter, add badge, slug exports.
- [ ] **Step 3:** `npx vitest run` (full frontend) + `npx tsc --noEmit` (expect only the pre-existing `TS5101 baseUrl` warning) → pass.
- [ ] **Step 4:** Manual: change the range on Reports → a server KPI (e.g. Overview total) rescopes; export filename carries the range slug; badge shows the active label.
- [ ] **Step 5:** Commit `feat(dates): reports UI sends range, shows active-range badge, scoped exports`.

---

## Remaining surfaces (uniform pattern)

Each is one SDD task following the pattern in Global Constraints. Listed with the
endpoint(s), the date field, and the page(s) to wire + badge.

| # | Surface | Backend endpoint / service | Date field | Frontend page(s) + badge |
|---|---------|----------------------------|-----------|--------------------------|
| 3 | Expenses overview | `GET /expenses/review` (done in R1) — verify | `expenseDate` | `ExpensesOverviewPage.tsx` (send params, badge, `rangeSlug` on CSV) |
| 4 | My Expenses | `GET /expenses/my-expenses` (+ `dateRangeQuery`) | `expenseDate` | `MyExpensesPage.tsx` |
| 5 | Reimbursements | `GET /expenses/review` (reuse) or reimbursements query | `expenseDate` | `ReimbursementsPage.tsx` |
| 6 | Pending Reviews | `GET /expenses/pending` (+ `dateRangeQuery`) | `expenseDate` | `PendingReviewsPage.tsx` |
| 7 | Admin/HR/Employee dashboards | the list endpoints they call (+ `dateRangeQuery`) | `expenseDate` | `AdminDashboard.tsx`, `HrDashboard.tsx`, `EmployeeDashboard.tsx` |
| 8 | Tasks | `GET /tasks` + `GET /tasks/my-tasks` (+ `dateRangeQuery`) | `dueDate` | `MyTasksPage.tsx`, `KanbanPage.tsx` (badge on toolbar) |
| 9 | Projects | `GET /projects` (+ `dateRangeQuery`) | `createdAt` | `ProjectListPage.tsx` |
| 10 | Departments | `GET /departments` data path (+ `dateRangeQuery`) | `createdAt` | `DepartmentsPage.tsx` |
| 11 | Activity feed | derive-on-read read path (+ `dateRangeQuery`) | event timestamp | activity page (badge) |
| 12 | Notifications | `GET /notifications` (+ `dateRangeQuery`) in `listForUser(userId, {from,to})` | `createdAt` | `NotificationsPage.tsx` |
| 13 | Help-desk tickets | `GET /tickets` (+ `dateRangeQuery`) in `listAllTickets`/`listTicketsForUser` | `createdAt` | `HelpDeskPage.tsx` |

For each task: backend (merge `dateRangeQuery`, `filterByDateWindow` on the date
field, thread through controller; keep RBAC), then frontend (`rangeToParams` →
api call in fetch deps, drop client `filterByDate`, `<ActiveRangeBadge>` near
title, `rangeSlug` in any export). Each is TDD: a backend window test and/or a
frontend "changing range refetches" test, then commit.

Exports specifically (Global Constraint): every export reads the same
backend-filtered array the page already holds — no separate "all data" fetch —
and its filename includes `rangeSlug(range)`.

## Self-Review

**Spec coverage:** Reports (R1/R2); expenses/reimbursements/pending (3,5,6);
my-expenses (4); dashboards (7); tasks (8); projects (9); departments (10);
activity (11); notifications (12); help-desk (13); exports (woven into every
task + the exports note); always-visible range (badge in every frontend task).
✓ All Workstream-3 surfaces + the always-visible requirement have a task.

**Type consistency:** all backend services adopt `(…, from?, to?)`; all
frontend api calls adopt a trailing `params: {from?,to?}`; every page uses
`rangeToParams(range)` and `<ActiveRangeBadge range={range} />`.

**Placeholder scan:** the reference slice (R1/R2) is concrete; the remaining
surfaces are uniform applications of the one pattern with their specific
endpoint/field/page named — no undefined helpers or unnamed files.
