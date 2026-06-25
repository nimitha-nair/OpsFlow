# OpsFlow Product-Readiness Audit & Execution Plan

Date: 2026-06-23
Branch: feat/ai-first-expense-submission
Method: 5 parallel read-only audits + direct verification of contested items.
Status: FINDINGS — awaiting decisions before implementation (per user instruction).

Legend — Effort: S(<1h) / M(half-day) / L(1day+). Risk: low/med/high.

---

## A. Findings by item

### 1. Internal IDs visible to users — PARTLY TRUE
- **VERIFIED FALSE for the named screen:** `QuickCreateTaskDialog.tsx` (global New
  Task) already renders project **names** (l.177) and member **names** (l.234).
- **REAL leaks:** `ProjectTasks.tsx:76` (`m.user?.name ?? m.userId`), `:169`
  (`... ?? task.assigneeId`), `ProjectMembers.tsx:219` (`... ?? member.userId`).
  Fallback is a raw Firestore id.
- **Root cause to confirm:** if `listProjectMembers` doesn't populate `user.name`,
  assignees render as "Unknown"/id everywhere. Fix = ensure name resolves
  (backend join or client lookup), fallback to email then a friendly label —
  never an id. Codes (TKT/EXP/PRJ/TSK) already render where applicable.
- Effort S–M, risk low.

### 2. Filter labels showing bare "All" — APPEARS ALREADY DONE
- Audit found explicit labels everywhere: "All projects/statuses/priorities/
  versions/departments/categories/entries" (KanbanToolbar 165–235, MyTasksPage
  139/156, ExpensesOverviewPage 213/227/240, PendingReviewsPage 187/205,
  HelpDeskPage 134). No bare "All" found in current source.
- **Action:** likely a stale build on the user's side. Verify in the running app;
  fix only stragglers the user can point to. Effort S, risk low.

### 3. Reports → Expenses Monthly Trend not rendering — ROOT CAUSE FOUND
- `ExpensesTab.tsx:146` gates the whole trend card behind
  `isEmpty = data.spendByCategory.length === 0`. If no APPROVED expense has a
  category, the trend (which is computed independently and zero-padded) is hidden.
- Backend (`reports.service.ts:81–118`) aggregates **approved-only** within a
  trailing month window; old/no approvals → all-zero bars.
- **Fix:** decouple the trend from the category check (`hasMonthlyData =
  monthlyTrend.some(m => m.amount > 0)`); render trend whenever data exists, show
  a proper EmptyState otherwise. Effort S, risk low.

### 4. PDF export blank / missing content — ROOT CAUSE FOUND
- Pipeline = browser print (`export.ts:142` `printElement`, clones to
  `#print-portal`, `@media print` in `index.css:181–222`).
- Causes: (a) SVG/CSS gradients not carried into the print clone → charts paint
  blank; (b) no forced light `color-scheme` → dark-mode colors invisible on white;
  (c) hidden report tabs never laid out, so `revealAll` exposes empty panels;
  (d) %-height chart columns don't survive page breaks.
- **Fix:** dedicated print stylesheet that forces light tokens + solid chart
  fills, inline/duplicate gradient defs into the clone, force-render all panels
  before cloning, fixed chart heights + page-break-inside:avoid. Manual PDF
  verification required. Effort M–L, risk med.

### 5. Help Desk redesign + ownership — NEEDS NEW DATA MODEL
- Today: primary nav for all roles (`navigation.ts:49/58/67`), routes in App.tsx.
  Tickets have only `category` (QUESTION/ISSUE/REQUEST), `priority`, `status`,
  `assignedTo`. **No team/department/type field.** Backend treats ADMIN==HR as one
  "staff" group with identical permissions (`ticket.controller.ts:31`, all staff
  see all tickets).
- **Blocks the requested split** (HR resolves HR/policy; Admin resolves
  system/platform/project). Needs: a ticket `team` field (e.g. HR | IT/SYSTEM),
  set at creation (category→team or explicit picker); list filtering by team
  (HR sees HR-team, Admin sees all); move entry to a floating/header support
  control out of primary nav.
- Effort L, risk med. **Design decision required (below).**

### 6. Task creation discoverability — GAPS CONFIRMED
- Admin can create only from AdminDashboard button + Kanban button (both
  `QuickCreateTaskDialog`). No topbar entry; none on HR/Employee dashboards.
- **Fix:** add a global "New" action in `AppTopbar` (role-aware) + dashboard
  quick actions. Effort S–M, risk low.

### 7. Calendar empty/broken — ROOT CAUSE FOUND
- `CalendarView.tsx:27–36` reads **only `task.dueDate`**; renders a full grid with
  no empty state; silent-fails on missing/invalid dates; only fed already-filtered
  tasks from KanbanPage.
- **Fix:** add empty state + invalid-date guard; broaden inputs to task due dates,
  project end/milestones, expense dates, reimbursements, ticket activity (a small
  unified "calendar events" builder). Effort M–L, risk med.

### 8. Footer "X Workspace" dead text — CONFIRMED DECORATIVE
- `AppSidebar.tsx:89–96` renders `roleWorkspaceLabel[role] + "workspace"`. Not a
  link/menu. **Action:** remove (or replace with the role chip already shown
  elsewhere). Effort S, risk low.

### 9. Activity feed permissions — EMPLOYEE OK, HR TOO BROAD
- Employees are correctly scoped server-side to their own tickets/tasks/expenses
  (`activity.service.ts`, `controller.ts:22`). **No employee leak.**
- **Gap:** HR gets the *same* org-wide feed as Admin (tasks/users/projects
  included). Requirement: HR = expense + approval + ticket + compliance only.
- **Fix:** add a third scope ("staff-hr") that filters the feed to expense/ticket
  (+approvals) and excludes task/user/project. Effort M, risk low.

### 10. Employee task status UX — CONFIRMED DROPDOWN-HEAVY
- Status changes via `<Select>` in `MyTasksPage.tsx:242` and kanban drag.
  `TaskDetailsDialog` shows a badge but no quick control.
- **Fix:** status chips / quick-action buttons (Todo→In Progress→Review→On Hold→
  Done) on cards + details dialog, calling existing `updateTaskStatus`. Effort M,
  risk low.

### 11. Global search — DOES NOT EXIST
- No topbar search, no cross-entity endpoint. Only `/users` (and partially
  `/projects`) support a `search` param; tasks/tickets/expenses don't.
- **Fix:** backend `/search?q=` aggregating tasks/projects/users/expenses/tickets
  (name + code + assignee), RBAC-scoped; topbar omnibox with grouped results +
  keyboard nav. Effort L, risk med. **Scope decision required (below).**

### 12. Notification center — MOSTLY EXISTS
- `NotificationBell` already has unread badge, history dropdown (≤40), mark-one /
  mark-all read, 60s poll, deep links; 8 notification types; triggers on task
  assign, ticket create/update/reply, expense decisions.
- **Gaps vs "center":** no dedicated full-page history; no role-specific
  filtering; no real-time (poll only). **Fix:** add a `/notifications` page +
  optional category/role filtering. Bell stays. Effort M, risk low.

### 13. Role-based dashboards — TOO EXPENSE-CENTRIC
- All three dashboards are expense-only; **tasks and tickets appear nowhere.**
  Admin lacks task/department/ticket/compliance widgets; HR lacks workforce/
  approvals/tickets; Employee lacks my-tasks/my-tickets.
- **Fix:** add role-appropriate task/ticket widgets, reduce shared widgets. Effort
  L, risk med (touches all three + new data fetches).

### 14. Quick actions — GAPS CONFIRMED
- Admin: only New Task. HR: none (just a hero link). Employee: expense actions
  only, no New Ticket.
- **Fix:** Admin (New Task, New Project, New Department, Export Reports), HR
  (Review Expenses, Approvals, Help Desk), Employee (New Expense, New Ticket).
  Effort S–M, risk low.

### 15. Empty states — A FEW WEAK ONES
- Weak/missing: `KanbanColumn.tsx:76` ("No tasks"), `TimelineView.tsx:84`,
  chart primitives `charts.tsx:17` (BarList) & `bi.tsx:340` (RankingList) ("No
  data."), `CalendarView` (none), `ReportsWorkspace.tsx:213` fallback.
- Rest of app already uses the shared `EmptyState` well.
- **Fix:** route the weak ones through `EmptyState` with guidance/next action.
  Effort S–M, risk low.

### 16. Final readiness review — gate, not a feature
- Run after each wave: build + tests green; manual verify exports, charts,
  calendar, activity scoping, help-desk workflow, search, dashboard separation.

---

## B. Proposed execution waves

**Wave 1 — Broken experiences + quick wins (S/M, low risk):**
#1 ID leaks, #2 filter verify, #3 monthly trend, #7 calendar (empty-state+guard+
sources), #8 footer, #6 task-create entry points, #14 quick actions, #15 empty
states.

**Wave 2 — UX redesigns (M/L):**
#10 task-status chips, #13 dashboard role separation, #9 HR activity narrowing,
#4 PDF export hardening (+manual PDF check).

**Wave 3 — New subsystems (L, design-heavy):**
#5 Help Desk relocation + ownership model, #11 global search, #12 notification
center page + role filtering.

**Wave 4 — #16 readiness gate:** full build/test/manual verification matrix.

Each wave ends with build+typecheck green and a short verification note before
moving on.

---

## C. Decisions required before coding
1. **Help Desk:** floating support widget vs header icon; and confirm the ticket
   `team` routing model (HR-team vs IT/System-team; Admin sees all).
2. **Global search depth:** full backend cross-entity endpoint + omnibox (L), or a
   lighter first cut (users/projects/tasks by name+code) now and expand later.
3. **Sequencing:** wave-by-wave with approval gates (recommended) vs one large drop
   then review.
4. **Notification center:** dedicated page + role filtering, or keep the existing
   bell and only add HR/role filtering.
