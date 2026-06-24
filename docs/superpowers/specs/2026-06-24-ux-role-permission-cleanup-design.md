# UX & Role-Permission Cleanup — Design

Date: 2026-06-24
Branch: `feat/ai-first-expense-submission`

Eight focused cleanups across Admin, HR, and Employee surfaces. Most are frontend-only; only Activity reimbursement events (#2) and the HR ticket-create guard (#4) touch the backend.

## Admin

### 1. Project Spending discoverability
Today "Project Spending" exists only as the *Projects* tab inside `/admin/reports` (spend-vs-budget, utilization). It is reachable solely by navigating Reports → Projects.

- `ReportsWorkspace` honors a `?tab=<id>` query param so deep-links land on a specific tab.
- Projects list page (`ProjectsPage`) gets a **"Spending"** action linking to `/admin/reports?tab=projects`.
- Project view gets a per-project deep-link into the Projects tab.
- Reports *Overview* tab gets a **spending summary card** (total budget / spent / over-budget count) linking into the Projects tab.
- No new sidebar item.

### 2. Activity Feed — categories + filtering
Activity is derive-on-read from 5 entities (`ticket`, `task`, `expense`, `user`, `project`). No filtering UI exists today.

- **Backend:** add a `reimbursement` entity to the derivation, derived from expenses transitioning to reimbursed/paid. Full set becomes: Tasks, Expenses, Reimbursements, Tickets, Projects, Users.
- **Frontend:** add category filter chips (role-appropriate) and a "Group by type" toggle alongside existing day-grouping. Default chronological, newest-first within groups.
- Role-appropriate chip sets:
  - Admin: all six.
  - HR: Expenses, Reimbursements, Tickets.
  - Employee: Tasks, Expenses, Reimbursements, Tickets.
- Shared `ActivityFeed` component — this also resolves the Employee Activity module (#7).

## HR

### 3. AI Metrics — keep trimmed operational only
`HrInsightsDashboard` keeps only **adoption %** and **extraction accuracy** ("is AI helping process expenses"). Remove confidence distribution, manual-correction internals, and the degraded `getReportsAiAnalytics` admin-analytics fetch from the HR path.

### 4. Tickets — ownership model
The requested model is already enforced (HR sees only `team:"HR"`; SYSTEM → Admin; cross-team reassign is Admin-only). One change:

- Lock the ticket-create team picker to "HR" for HR users (they cannot file into SYSTEM). Admin keeps full choice.
- Add a matching backend guard on create so an HR user cannot create a SYSTEM-team ticket via the API.

## Employee

### 5. Dashboard
- Remove the `EmployeeGettingStarted` ("A few steps to get going") block entirely.
- Move **Quick Actions** to a prominent full-width row directly under the hero, above the metric cards (Submit Expense / View Drafts / My Tasks / New Ticket).

### 6. Projects → "Created By" ID leak
`ProjectViewPage.tsx:116` and `ProjectDetailsPage.tsx:179` render the raw `createdBy` UID.

- **Backend:** include `createdByName` in the project payload (mirrors the tickets pattern).
- **Frontend:** render the name, falling back to "Unknown" / the code if absent.
- Audit fix: HelpDesk assignee selector shows a raw `assignedTo` id in its trigger — resolve to the staff name there too.

### 7. Activity module
Covered by #2 (shared component).

### 8. Expense submission flow — distinct actions
On `AnalysisReviewPage`, "Looks Good →" and "Verify & edit →" both call the same `goVerify()` → same `/verify` page.

- Primary action renamed **"Submit"** — submits the AI-extracted expense for approval immediately (no detour through the verify page). Brief inline toast confirmation, no modal.
- Secondary action renamed **"Edit"** — opens the verification form to adjust fields before submitting.
- Extract the submit logic from `ExpenseVerificationPage.confirmAndSubmit` into a shared helper so the analysis page can call the fast-path directly.

## Scope notes
- Backend changes: #2 (reimbursement activity events), #4 (HR create guard), #6 (`createdByName` on project payload).
- Everything else is frontend.
- Out of scope: any new top-level navigation; changes to Admin's deep AI-auditing tab; reworking ticket team routing (already correct).
