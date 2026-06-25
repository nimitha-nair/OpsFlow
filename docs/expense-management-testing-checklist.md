# Expense Management (Phase 3A) — Testing Checklist

Scope: expense submission, document uploads, approval workflow, reimbursement
tracking, project budget utilization. **No AI / OCR.**

## Backend — RBAC

- [ ] `POST /expenses` — only EMPLOYEE (HR/ADMIN → 403).
- [ ] EMPLOYEE can submit only for projects they are assigned to (non-member → 403).
- [ ] `GET /expenses/my-expenses` — EMPLOYEE only; returns own expenses.
- [ ] `GET /expenses/:id` — owner ✓, HR ✓ (any), ADMIN ✓ only if APPROVED (else 403),
      other employee → 403.
- [ ] `GET /expenses/pending` — HR only.
- [ ] `PATCH /expenses/:id/approve` and `/reject` — HR only.
- [ ] `GET /expenses` — ADMIN only; returns APPROVED only.
- [ ] `GET /expenses/project/:projectId` — ADMIN only.

## Backend — Validation

- [ ] `amount` must be > 0 (0 / negative → 400).
- [ ] `category` must be a valid enum value (else 400).
- [ ] `type` must be DOCUMENT or CASH.
- [ ] `projectId` must exist (else 404) and be assigned to the employee.
- [ ] `expenseDate` must be a valid date.
- [ ] Unknown body fields rejected (strict schemas → 400).
- [ ] Reject requires `remarks` (empty → 400); approve `remarks` optional.
- [ ] Path ids reject `/` / reserved patterns.

## Backend — Approval workflow & budget

- [ ] New expense starts `SUBMITTED` / reimbursement `PENDING`.
- [ ] Approve → `APPROVED`; reject → `REJECTED`; both create an `expenseApprovals`
      record (reviewerId, status, remarks, reviewedAt).
- [ ] Re-reviewing an already-reviewed expense → 400.
- [ ] Project spending counts **only APPROVED** expenses; utilization =
      totalSpent / budget. Non-approved expenses excluded.

## Backend — Firebase Storage

- [ ] Allowed types: JPG, JPEG, PNG, WEBP, PDF (others → 400).
- [ ] Size limit 5 MB (larger → 413).
- [ ] File stored under scoped path `expense-documents/<expenseId>/...`.
- [ ] Metadata recorded in `expenseDocuments` (fileName, fileType, storagePath,
      uploadedBy, uploadedAt); expense `documentId` linked.
- [ ] Upload allowed only by the owner and only while not yet reviewed.
- [ ] `GET /expenses/:id/document` returns a short-lived signed URL; original file
      remains the source of truth; access follows the same view RBAC as the expense.

> Note: clients never access the Storage bucket directly — uploads and downloads
> are server-mediated (Admin SDK + signed URLs), so access control is enforced by
> the API, not public Storage rules.

## Frontend — Employee

- [ ] **My Expenses**: lists own expenses with approval + reimbursement status.
- [ ] **Submit Expense**: project + category + type selectors; amount/date/description;
      receipt upload shown for DOCUMENT type (required) and hidden for CASH.
- [ ] Submitting a DOCUMENT expense uploads the file and links it.
- [ ] **Expense Details**: shows amount, category, project, statuses, description,
      and "View Document" (opens signed URL) when a receipt exists.

## Frontend — HR

- [ ] **Pending Reviews**: lists submitted expenses (employee + project resolved).
- [ ] **Details/Review**: Approve / Reject with remarks; view the uploaded document;
      status updates in place + toast.

## Frontend — Admin

- [ ] **Expenses Overview**: approved expenses + total, with reimbursement status.
- [ ] **Project Spending**: pick a project → Budget / Approved Spending / Utilization
      + utilization bar + approved expense list.

## Automated verification performed

- Backend live workflow: 24/24 (RBAC, validation, approval, project spending).
- Backend document upload/download: 5/5 (type filter, scoped path, link, signed URL).
- Frontend: `build` ✓, `lint` ✓, `vitest` ✓.
- Live Firebase Storage upload was exercised against a fake bucket (no real bucket
  writes); run a manual upload against the live bucket to confirm credentials/signing.
