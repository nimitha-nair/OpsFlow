# OpsFlow — Product Requirements Document (PRD)

> **Status:** Approved for MVP build
> **Last updated:** 2026-06-12
> **Owner:** Product
> **Related docs:** [DATABASE.md](./DATABASE.md) · [WORKFLOWS.md](./WORKFLOWS.md) · [API_DESIGN.md](./API_DESIGN.md) · [AI_PIPELINE.md](./AI_PIPELINE.md)

---

## 1. Overview

**OpsFlow** is an AI-powered internal operations platform for IT solutions and
training companies. It unifies **project management, task tracking, expense
management, AI-powered expense extraction, approval workflows, reimbursement
tracking, and operational analytics** into a single workspace.

Its key differentiator is the **AI Expense Intelligence Engine**: employees upload
a receipt or invoice and the system automatically extracts vendor, amount, date,
payment method, and category using **Kimi-K2.6 Vision via NVIDIA Build**, removing
manual data entry and accelerating reimbursement.

OpsFlow is built for a **single organization** (no multi-tenant / workspace
abstractions) with three roles — **Admin, HR, Employee** — each gated by
Role-Based Access Control (RBAC) plus ownership-based access control.

### 1.1 Problem

Organizations stitch together separate tools for projects, tasks, expenses, and
reimbursements, producing fragmented data, manual expense entry, slow approvals,
inconsistent records, and poor budget visibility.

### 1.2 Solution

A modular platform that:
1. Centralizes projects, members, tasks, and expenses.
2. Auto-extracts expense data from uploaded documents using vision AI.
3. Lets employees verify/correct AI output before submission.
4. Routes expenses through structured HR approval.
5. Tracks reimbursements and surfaces role-specific analytics.

### 1.3 Goals

- Eliminate manual expense entry via AI extraction.
- Standardize project → task → expense → approval → reimbursement flow.
- Give Admin/HR real-time operational and budget visibility.
- Keep the system secure, modular, and scalable.

### 1.4 Non-Goals (MVP)

- Multi-tenant / multi-organization (single org only — no `tenant_id`/`organization_id`).
- Separate `reimbursements`, `audit_logs`, or `notifications` tables.
- Refresh tokens or password-reset flows.
- Duplicate-receipt / fraud detection.
- Project Manager / Team Lead roles.
- Predictive analytics, native mobile apps, message-queue infrastructure (Redis/BullMQ).

---

## 2. Roles & Personas

| Role | Description | Primary capabilities |
|---|---|---|
| **ADMIN** | Organization administrator | Manage users, projects, members, tasks; full analytics; manage budgets |
| **HR** | Finance/operations reviewer | Review expense queue, approve/reject, manage reimbursement status, review metrics |
| **EMPLOYEE** | Staff member | View assigned projects & tasks, update own task status, submit & track own expenses |

Access is enforced on **two layers**: RBAC (role) **and** ownership (an Employee
may only access their own expenses, their own tasks, and projects they are a member
of). See [API_DESIGN.md](./API_DESIGN.md) §RBAC and [DATABASE.md](./DATABASE.md).

---

## 3. Core Concepts (shared vocabulary)

- **Project** — a unit of client work with a budget, status, and members.
- **Project Member** — mapping of an employee to a project (many-to-many).
- **Task** — Kanban work item (`TODO → IN_PROGRESS → DONE`) belonging to a project.
- **Expense** — a reimbursement request submitted by an employee; document-based or cash.
- **Expense Document** — the original receipt/invoice file (in Firebase Storage).
- **Expense Analysis** — raw AI extraction result for an expense (in `expense_analysis`).
- **Expense Approval** — HR's decision record for an expense.
- **Reimbursement** — tracked via fields **on the `expenses` table** (no separate table).

---

## 4. System Modules

1. **Authentication & RBAC** — Login, Logout, JWT, role + ownership middleware, user deactivation, change password.
2. **Dashboard & Analytics** — role-specific dashboards (Admin / HR / Employee).
3. **Project Management** — create/edit projects, assign members, manage budgets, track spend.
4. **Task Management** — create/assign tasks, Kanban status, priorities, deadlines.
5. **Expense Management** — document & cash submission, tracking, reimbursement status, project mapping.
6. **AI Expense Intelligence** — async extraction via Kimi-K2.6 Vision, confidence scoring, structured output.
7. **Approval Workflow** — HR review queue, approve/reject with remarks, budget rollup.

---

## 5. Functional Requirements

Priority: **M**ust / **S**hould / **C**ould.

### 5.1 Authentication & Access

| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Users log in with email + password; receive a JWT | M |
| FR-1.2 | Logout invalidates the client session | M |
| FR-1.3 | Every request is authorized by role (RBAC) **and** resource ownership | M |
| FR-1.4 | Admin can deactivate/reactivate users (`is_active`) | M |
| FR-1.5 | Authenticated users can change their own password | M |
| FR-1.6 | **Per-request `is_active` check** — a deactivated user is denied even if their JWT has not expired | M |
| FR-1.7 | An initial **bootstrap ADMIN** is seeded from environment variables on first DB setup (no public registration) | M |
| FR-1.8 | Refresh tokens and password-reset flows are **excluded** from MVP | — |

### 5.2 Project Management

| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Admin creates/edits projects (name, client, budget, currency, status) | M |
| FR-2.2 | Admin assigns/removes project members | M |
| FR-2.3 | Project detail shows members, tasks, expenses, and budget utilization | M |
| FR-2.4 | Projects exceeding budget are **flagged with a warning** (approvals never blocked) | M |

### 5.3 Task Management

| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Admin creates/assigns tasks within a project | M |
| FR-3.2 | Tasks carry title, description, assignee, priority, due date, status | M |
| FR-3.3 | Assignee can update their task status across `TODO/IN_PROGRESS/DONE` | M |
| FR-3.4 | Employees see only tasks assigned to them | M |

### 5.4 Expense Management

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Employee submits a **document-based** expense (receipt/invoice upload) | M |
| FR-4.2 | Employee submits a **cash** expense via manual form | M |
| FR-4.3 | Every expense maps to a project (`project_id` required) for budget tracking | M |
| FR-4.4 | Expense carries currency (default **INR**) | M |
| FR-4.5 | Employee can track expense status and history; can delete an expense while `DRAFT` | M |
| FR-4.6 | Reimbursement tracked via `reimbursement_status` (NONE/PENDING/PROCESSING/PAID), `reimbursement_date`, `reimbursement_reference`; `NONE` until approved, then `PENDING` | M |
| FR-4.7 | **One document per expense (MVP)**; allowed files: PDF, PNG, JPG, JPEG; max **10 MB**; stored privately in Firebase (no public URLs) | M |

### 5.5 AI Expense Intelligence

| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | On document upload, AI extraction runs **asynchronously** (never blocks the request) | M |
| FR-5.2 | Extracted fields: vendor, amount, date, payment method, category, confidence score | M |
| FR-5.3 | Analysis lifecycle via `ai_status`: PENDING → PROCESSING → COMPLETED / FAILED / LOW_CONFIDENCE | M |
| FR-5.4 | FAILED or LOW_CONFIDENCE analyses fall back to **manual entry** | M |
| FR-5.5 | Raw AI output stored in `expense_analysis`; confirmed values stored in `expenses` | M |
| FR-5.6 | Confidence score is **advisory only** — HR always makes the final decision | M |

### 5.6 Employee Verification (Correction Step)

| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | After AI analysis, employee reviews extracted fields | M |
| FR-6.2 | Employee can **edit/correct** any extracted field before submission | M |
| FR-6.3 | Employee submits the final, confirmed expense for HR review | M |

### 5.7 Approval Workflow

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | HR sees a queue of expenses pending review | M |
| FR-7.2 | HR review UI shows receipt viewer (left) + AI analysis & actions (right) | M |
| FR-7.3 | HR approves or rejects; rejection requires remarks | M |
| FR-7.4 | Approved expenses count toward project spend, company records, analytics, reimbursement eligibility | M |
| FR-7.5 | Rejected expenses are excluded from budgets and analytics | M |

### 5.8 Analytics & Lists

| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Role-specific dashboards (Admin / HR / Employee) | M |
| FR-8.2 | All list endpoints support **pagination, filtering, sorting, and search** | M |
| FR-8.3 | Admin analytics: total employees, active projects, monthly expenses, budget utilization | M |
| FR-8.4 | **HR has read-only access** to analytics, expense metrics, and approval metrics; HR cannot modify budgets or administrative settings | M |

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Architecture** | Modular, scalable, API-driven, middleware-based security |
| **Security** | JWT auth; RBAC + ownership checks server-side on every request; per-request `is_active` re-check; secrets in env vars only |
| **Auth policy** | Passwords hashed with **argon2id**; access-token TTL ~8h; login rate-limiting; password min-length policy. Logout is client-side token discard (no server denylist in MVP) |
| **Operations** | `GET /api/health` for readiness/liveness; timestamps stored in UTC, presented in IST |
| **AI** | Async processing; lightweight in-process implementation (no Redis/BullMQ in MVP) |
| **Storage** | Original documents in Firebase Storage (private); DB stores only references/URLs |
| **Data model** | Single org; exactly 8 tables; UUID primary keys; `created_at`/`updated_at` on every table |
| **Files** | PDF/PNG/JPG/JPEG only; ≤ 10 MB; private access via signed URLs |
| **Performance** | List endpoints paginated; AI never blocks request/response cycle |
| **Deployment** | Trunk-based deployment |

---

## 7. Page Inventory

**Auth:** Login.
**Admin:** Dashboard, Projects, Project Details, Tasks, Employees, Expenses.
**HR:** Dashboard, Expense Review.
**Employee:** Dashboard, My Projects, My Tasks, Expense Submission, Expense History.
**Shared:** Profile (with Change Password).

---

## 8. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MySQL (UUID PKs) |
| File storage | Firebase Cloud Storage (private) |
| AI | Kimi-K2.6 Vision via NVIDIA Build APIs |
| Auth | JWT |
| Authorization | RBAC + ownership-based access control |
| Deployment | Trunk-based |

---

## 9. End-to-End System Flow

```
Admin → Create Projects → Assign Employees → Create Tasks
Employee → View Tasks → Work on Projects → Submit Expenses
Expense → Firebase Storage → Kimi-K2.6 Vision (async) → AI Analysis
Employee → Review/Correct AI fields → Submit
HR → Review Analysis → Approve / Reject
Approved Expense → Project Budgets → Company Records → Analytics Dashboard
```

Detailed flows in [WORKFLOWS.md](./WORKFLOWS.md).

---

## 10. Future Enhancements (out of MVP scope)

- `activity_logs` table (audit logging).
- `notifications` table and delivery.
- Dedicated `reimbursements` table.
- Duplicate-receipt / fraud detection.
- Predictive analytics, message-queue-backed AI processing, refresh tokens, password reset.
