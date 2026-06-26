# Notifications system audit — 2026-06-26

Branch: `feat/analytics-currency-notifications-manual`. End-to-end trace of the
notification subsystem (backend service/controller/routes + frontend bell/page/sound),
verdict per capability, then the one confirmed gap fixed (expense lifecycle notifications).

## 1. Record creation correctness — PASS
- `createNotification(userId, input)` writes `{ userId, type, title, body, read:false,
  createdAt: serverTimestamp() }` and only adds `taskId`/`ticketId` when truthy
  (`backend/src/services/notification.service.ts:48-63`). Uses `FieldValue.serverTimestamp()`
  so ordering is server-authoritative.
- `notify(recipients, input, exclude?)` filters falsy ids and the actor, de-dups via `Set`,
  and fans out with `createNotification(...).catch(() => {})` so a failed write never throws
  (`notification.service.ts:71-82`). Best-effort by construction.
- Role-scoping at the record level is correct: every notification carries the recipient's
  `userId`; there is no shared/broadcast record.

## 2. Notifications appear in the list — PASS
- `listForUser(userId, limit=40, from?, to?)` queries `where("userId","==",userId)`, applies
  `filterByDateWindow` on `createdAt`, sorts newest-first in memory, then slices to `limit`
  (`notification.service.ts:87-104`). Limit applies to the date-scoped set (documented).
- `GET /notifications` returns `{ data, unread }` for `req.user.userId`
  (`backend/src/controllers/notification.controller.ts:21-36`); route mounted at
  `/notifications` and auth-guarded (`backend/src/routes/notification.routes.ts`, `app.ts`).

## 3. Mark-as-read — PASS
- Single: `markRead(id, userId)` loads the doc and throws 404 unless `data.userId === userId`,
  then sets `read:true` (`notification.service.ts:117-124`). Ownership enforced — a user
  cannot mark another user's notification (the 404 hides existence).
- All: `markAllRead(userId)` reads the user's docs, filters unread, and commits in batches of
  ≤400 (`notification.service.ts:127-146`). Correct batching for the 500-op Firestore limit.
- Controllers (`patchNotificationRead`, `patchAllRead`) pass `req.user.userId` and 401 when
  unauthenticated (`notification.controller.ts:39-65`).

## 4. Badge unread counts — PASS
- `countUnread(userId)` = `where(userId).where(read==false).size`, global (not date-filtered)
  (`notification.service.ts:107-114`) — matches the badge's "all unread" semantics.
- `NotificationBell.tsx` loads on mount and polls every 60s; chimes only when `unread` rises
  above the previously-seen count (guarded by `prevUnread.current !== null` so no chime on first
  load) (`frontend/src/components/layout/NotificationBell.tsx:34-57`).
- Badge refreshes after marking read: `onItem` decrements `unread` and syncs `prevUnread`
  (`:71-83`); `onMarkAll` zeroes both (`:85-90`); opening the dropdown calls `refresh()` which
  re-pulls and re-syncs without chiming (`:59-69,95-98`). Verified the badge cannot get "stuck".

## 5. Sound preferences — PASS
- Preference persisted per-browser in `localStorage` key `opsflow:sound-alerts`, default ON
  (`frontend/src/lib/notification-sound.ts:6-23`). `playNotificationChime()` no-ops when
  disabled or Web Audio is unavailable, and resumes a suspended context (`:30-65`).
- Toggle lives in `AppTopbar.tsx` (`soundAlertsEnabled`/`setSoundAlertsEnabled`, local `soundOn`
  state). Played from the bell's poll when a genuinely new notification appears (point 4).

## 6. Role-scoping — PASS
- Every read/write path filters by the caller's `req.user.userId`: `listForUser`, `countUnread`,
  `markRead` (ownership check), `markAllRead`. No endpoint accepts a target userId from the
  client. A user can neither read nor mutate another user's notifications.

## Gap found and fixed — expense lifecycle notifications (was GAP → now wired)
`notify()` was called from task/comment/ticket controllers but **never for expenses**, so an
employee got no signal on approve/reject/paid and reviewers got none on submit. Fixed in
`backend/src/controllers/expense.controller.ts`:
- `postSubmitExpense` → `EXPENSE_SUBMITTED` to HR+Admin reviewers (reusing
  `getStaffIds()` from `ticket.service`), excluding the submitter.
- `patchApprove` → `EXPENSE_APPROVED` to the submitter (`expense.employeeId`).
- `patchReject` → `EXPENSE_REJECTED` to the submitter, including the reviewer's remark when present.
- `patchReimbursement` → `EXPENSE_PAID` to the submitter, only when `reimbursementStatus === "PAID"`.

All four are best-effort (the `notify()` helper swallows errors; titles/bodies use the
human-readable `code`, e.g. `EXP-0041`, falling back to id). New `NotificationType` values
`EXPENSE_SUBMITTED|EXPENSE_APPROVED|EXPENSE_REJECTED|EXPENSE_PAID` added to
`backend/src/types/notification.types.ts` and mirrored in `frontend/src/types/notification.ts`;
a new "Expenses" category was added to `NotificationsPage.tsx`'s exhaustive `CATEGORY_OF`/labels.

Note (not a bug, out of scope): expense notifications carry no deep-link id (the
notification doc only models `taskId`/`ticketId`), so clicking one in the bell/page marks it read
but does not navigate. Adding an `expenseId` deep-link would be a follow-up.

Tests: `backend/src/controllers/expense.controller.test.ts` (5 cases, all green) covers submit→reviewers,
approve/reject/paid→submitter, and that a non-PAID reimbursement update does not notify.
