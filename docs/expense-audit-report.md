# Expense Management — Bug Hunt, Workflow Audit & UX Hardening

Date: 2026-06-16 · Scope: stability, correctness, workflow quality, production
readiness. **No AI implemented.**

---

## 1. Bug Report — issues found & fixed

### A. Document upload failures (root cause)
**Symptom:** receipt/invoice uploads failed with an opaque `500 Internal server
error`.

**Investigation:**
- *Frontend form-data* — ✅ correct. The axios client (`lib/api.ts`) does **not**
  force a `Content-Type`, so the browser sets `multipart/form-data` with the
  boundary automatically for `FormData`. Verified end-to-end (5/5 upload test).
- *Backend multer / validation* — ✅ correct (memory storage, 5 MB limit, MIME
  filter, scoped path, metadata write, expense link).
- *Firebase Storage upload* — ❌ **root cause here.**

**Root cause:** `FIREBASE_STORAGE_BUCKET` was never set, so the bucket fell back to
`` `${project_id}.appspot.com` `` = `opsflow-cc01b.appspot.com`. Firebase projects
created since **late 2024 use `<project>.firebasestorage.app`**, not
`.appspot.com`. So `bucket.file().save()` targeted a **non-existent bucket** and
threw — surfaced only as a generic 500. (Same failure if Storage was never
enabled in the console.)

**Fix:**
- Wrapped the Storage `save()` and `getSignedUrl()` calls in try/catch — now they
  return a clear **502** ("Check Firebase Storage is enabled and
  FIREBASE_STORAGE_BUCKET is set correctly") and **log the underlying error +
  bucket name** for diagnosis.
- Documented `FIREBASE_STORAGE_BUCKET` in `.env.example` with the correct-bucket
  guidance. **Action required:** set it to the exact bucket from Firebase Console
  → Storage.

### B. Expense scope — not everything is project-related
- Added **`scope: PROJECT | GENERAL`**. `projectId` is now **required only for
  PROJECT** expenses (Zod refine); GENERAL expenses store no project.
- `getProjectSpending` already counts only PROJECT, APPROVED expenses, so GENERAL
  expenses correctly never affect project budgets.
- Verified: PROJECT-without-projectId → 400; GENERAL → 201 with no project (12/12).

### C. Project IDs shown in the UI
- All expense surfaces now render **project names** (or **"General"** for
  general expenses); raw IDs no longer leak. Fixed `MyExpenses`, `ExpensesTable`,
  and `ExpenseDetails` (which previously fell back to the raw id on lookup
  failure).

### D. Login rate limiting too aggressive for dev
- **Before:** 10 attempts / IP / 15 min in all environments — a developer testing
  a few wrong passwords got locked out.
- **After:** production stays **10/15min** (strict); development is **1000**
  (overridable via `AUTH_RATE_LIMIT`); the broad API limiter is 300 (prod) /
  5000 (dev). Gated on `NODE_ENV === "production"`.

### E. Draft/Edit/Submit workflow (was missing)
- Added **`DRAFT`** approval status and a full lifecycle:
  `POST /expenses` (with `isDraft`), **`PATCH /expenses/:id`** (edit own draft),
  **`POST /expenses/:id/submit`** (draft → SUBMITTED).
- Drafts are **private to the owner** — excluded from HR's pending queue and not
  viewable by HR/Admin (canView updated). Editing/submitting a non-draft → 400.
- Frontend: Submit form now has **Save Draft** + **Submit**; My Expenses shows
  **Edit** on drafts; Details shows owner **Edit/Submit** actions.

### Other audit findings
- **RBAC** — re-verified across all expense endpoints (24/24 + 12/12): only
  EMPLOYEE submits/edits/submits own; only HR reviews; Admin sees approved;
  owner-only document access; drafts private. No issues.
- **State sync** — review/submit update the detail view in place; list pages
  refetch on navigation. OK.
- **Navigation** — Expenses entries present for all three roles; details routes
  are role-scoped. Edit route added.
- **Empty/placeholder pages** — Reports/Settings/Leave remain intentional future
  placeholders (out of scope; no new modules).
- **Mobile** — tables use `overflow-x-auto`; forms use responsive grids; sidebar
  is a drawer. No blocking issues found.

**Verification:** backend `tsc` clean; live workflow 24/24, scope+draft 12/12,
upload 5/5; frontend `build` ✓, `lint` ✓, `vitest` 4/4 ✓ (verified against a fake
Firestore + fake Storage — no live writes).

---

## 2. AI-Readiness Report

The Draft workflow is the key enabler: **AI populates a DRAFT → employee reviews
/ overrides → confirms by Submitting.** This gives auto-population, manual
override, and explicit confirmation out of the box.

| Field | AI auto-populate | Manual override | Confirm |
|---|---|---|---|
| amount | ✅ (form input editable) | ✅ | ✅ via Submit |
| category | ✅ (select) | ✅ | ✅ |
| expenseDate | ✅ (date) | ✅ | ✅ |
| description | ✅ (textarea, now optional) | ✅ | ✅ |
| scope / projectId | ✅ | ✅ | ✅ |

- The **document is the source of truth** (stored original + metadata) — AI
  extraction can attach to an existing draft without mutating the file.
- Every field is a normal controlled input, so an AI prefill step only needs to
  set initial form state; nothing is locked.

**What to add before AI (data-model hooks, not built now):**
- Optional fields on `expenses` for AI provenance: `aiGenerated?: boolean`,
  `aiConfidence?: number`, `extractionSource?: "AI" | "MANUAL"`, and per-field
  confidence, so the UI can badge AI-filled fields and require confirmation on
  low-confidence ones.
- An extraction endpoint (e.g. `POST /expenses/:id/extract`) that reads the
  uploaded document and returns suggested field values for the draft.
- A "fields changed by reviewer" diff to measure extraction accuracy.

**AI integration blockers (must clear first):** fix the Storage bucket (AI reads
the uploaded file); ensure signed-URL/file-read access works server-side.

---

## 3. Remaining recommendations before AI integration

1. **Set `FIREBASE_STORAGE_BUCKET`** and confirm a real upload + signed-URL
   download against the live bucket (the one path not covered by the fake-bucket
   tests).
2. **Reimbursement transitions** — model exists (`PENDING/PROCESSING/PAID`) but no
   endpoint changes it; add an HR/Admin reimbursement-update action if needed.
3. **Add AI provenance fields** to the expense model (above) ahead of extraction.
4. **Storage security rules** — uploads/downloads are server-mediated (Admin SDK +
   signed URLs), but add `storage.rules` denying all direct client access as
   defense-in-depth.
5. **Multer audit advisories** — `npm audit` flags transitive deps from multer;
   review/upgrade.
6. **Bundle size** (~711 kB) — route-level `lazy()` code-splitting.
7. **Pagination/scale** — expense lists filter in memory; move to indexed queries
   for large datasets.
8. **Automated coverage** — only the auth flow has UI tests; add expense
   workflow tests (draft → submit → review → spending).
