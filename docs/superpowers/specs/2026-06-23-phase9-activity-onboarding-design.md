# Phase 9 — Activity Feed + Onboarding / Empty-State Polish

Date: 2026-06-23
Branch: feat/ai-first-expense-submission
Status: Approved (design decisions confirmed with user)

## Context

Phases 1–8 are complete (Help Desk / Tickets exists; the only Phase 8 gap —
staff assignee + priority controls in the ticket dialog — was closed first).
Phase 9 adds a cross-module **activity feed** and an **onboarding / empty-state
polish** pass. No activity feed or audit log exists today; only a per-user
notifications bell and a task-scoped CalendarView in kanban.

## Decisions

- **Activity source: derive on read.** Aggregate recent docs from existing
  collections (tickets, tasks, expenses, users, projects) into one timeline at
  request time. No controller instrumentation, no backfill, shows real data
  immediately. Accepted limitation: no granular field-level history
  (we infer "created" / "updated to <status>" / "approved" from timestamps +
  current state, not a stored change log).
- **Calendar: day-grouped feed only.** Fold the calendar feel into the feed via
  Today / Yesterday / Earlier grouping. Existing task CalendarView untouched.
  No separate agenda page.

## Architecture

### Backend (`backend/src/`)

- `types/activity.types.ts` — `ActivityEvent` (id, entity, entityId, code?,
  verb, title, description?, actorId?, actorName?, timestamp, link?),
  `ACTIVITY_ENTITIES`.
- `services/activity.service.ts` — `listActivity({ scopeUserId?, limit })`.
  - Builds a `userId -> name` map once (`users` collection).
  - Reads each source collection, maps docs to one or more `ActivityEvent`s:
    - ticket: `created`; `updated` (now <status>) if updatedAt > createdAt.
    - task: `created`; `updated` (now <status>) if updatedAt > createdAt.
    - expense: `created` (submitted); `reviewed` (approved/rejected) if
      approvalStatus is decided and updatedAt > createdAt.
    - user: `joined` (org-wide only).
    - project: `created` (org-wide only).
  - Merge, sort by timestamp desc, slice to `limit` (default 40).
  - Scope: if `scopeUserId` set (employee), include only events the user owns
    (ticket.createdBy, task.assigneeId|createdBy, expense.employeeId); exclude
    user/project events.
- `controllers/activity.controller.ts` — `getActivity`: staff (ADMIN/HR) →
  org-wide; employee → scoped to self.
- `routes/activity.routes.ts` — `GET /activity` (authenticate, any role,
  validate query `{ limit? }`). Registered in `app.ts`.

### Frontend (`frontend/src/`)

- `types/activity.ts` — mirror of `ActivityEvent` + entity labels/icons map.
- `lib/activity-api.ts` — `listActivity(limit?)`.
- `components/activity/ActivityFeed.tsx` — reusable list: groups by day
  (Today / Yesterday / <date>), per-entity icon + accent, optional deep link.
  Handles loading / error / empty internally or via props. `compact` variant
  for dashboard widgets.
- `pages/ActivityPage.tsx` — full page (PageHeader + ActivityFeed, limit 40).
- Nav + routes: add "Activity" to `navByRole` for all three roles; routes
  `/admin/activity`, `/hr/activity`, `/employee/activity` in `App.tsx`.
- Dashboard widget: compact ActivityFeed (limit ~6) in a SectionCard on each
  role dashboard.

### Onboarding / empty-state polish

- `components/onboarding/GettingStarted.tsx` — a dismissible "Get started"
  checklist card. Props: `steps: { label, done, to, icon }[]`. Renders a
  progress count, check/▢ per step, links to the relevant page. Hidden when all
  steps done or dismissed (persisted in localStorage per role).
- Each role dashboard computes its steps from data it already loads and renders
  GettingStarted above the fold.
- Empty-state sweep: audit list pages; standardize any weak/missing empty
  states on the shared `EmptyState` component. Targeted, not a rewrite.

## Out of scope (YAGNI)

- Stored audit log / change history.
- Dedicated calendar/agenda page.
- Real-time updates (feed loads on navigation, like the rest of the app).
- Pagination of activity (single capped page; "limit" query only).

## Testing / verification

- `npm run build` (frontend tsc -b) and backend typecheck pass.
- Manual: activity page renders real events for admin (org-wide) and employee
  (own only); dashboard widget shows recent items; getting-started checklist
  reflects real progress and dismisses.
