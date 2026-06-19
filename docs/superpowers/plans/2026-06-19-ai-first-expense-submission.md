# AI-First Expense Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move employee expense entry to an AI-first flow — Upload Receipt(s) → Analyze (Kimi, all docs merged) → Verify → Submit — with multi-file support, minimal required fields, a modernized indigo/violet UI scoped to expense screens, and AI adoption analytics.

**Architecture:** Additive, backward-compatible changes. The expense keeps its single `documentId` (primary doc) and gains a `documentIds: string[]` list; all existing single-document read paths keep working. The Kimi extractor is generalized to accept N documents (each rendered to up to 3 page-images, total capped) sent in one call and reconciled into one result. Creation validation is relaxed so AI-path drafts need only Project + Receipt; verified values are written back at confirm (existing behavior) plus a description backfill. Analytics extend the existing `buildAiAnalytics` aggregator forward-only.

**Tech Stack:** Backend — Node/Express, TypeScript, Firebase Admin (Firestore), Zod, multer, sharp, pdf-to-img, vitest. Frontend — React 19, react-router, axios, Tailwind v4 + shadcn-style UI, lucide-react, sonner, vitest + Testing Library.

## Global Constraints

- **Backward compatibility is mandatory.** `documentId` (singular) stays on the expense and on the analysis row; legacy endpoints `GET /expenses/:id/document` and `/document/file` remain. Old expenses with no `documentIds` read as a one-element list derived from `documentId`.
- **No destructive migration.** New fields (`documentIds`, `creationMethod`) are additive and forward-only. Historical rows read `null`/derived defaults.
- **File limits (unchanged per file):** 5 MB each; MIME allow-list `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. **New caps:** max **5 documents** per expense; max **3 rendered pages** per PDF; max **8 flattened images** per Kimi call (excess pages dropped with a `console.warn`, never silently).
- **Currency:** default `"INR"`.
- **Theming is scoped to expense screens only** — do not change global `--primary` in `index.css`. Use expense-scoped classes/tokens (indigo-600 primary, violet-500 AI moments, emerald-500 success).
- **Tests:** `cd backend && npm test` / `cd frontend && npm test` (both `vitest run`). `cd backend && npm run typecheck` for type checks. Prefer pure, dependency-free functions tested directly (mirror `reports.aggregate.test.ts`); keep Firestore wiring thin.
- **Commit after each completed phase** with a meaningful message ending in the Co-Authored-By trailer.

---

## File Structure Overview

**Phase 1 — multi-file foundation**
- Modify: `backend/src/types/expense.types.ts` (add `documentIds?: string[]`), `frontend/src/types/expense.ts` (mirror)
- Create: `backend/src/services/expense-documents.read.ts` (pure helper: derive doc-id list) — small, testable
- Modify: `backend/src/services/expense-document.service.ts` (list by expenseId, delete-one helpers), `backend/src/services/expense.service.ts` (`addExpenseDocumentId`, `removeExpenseDocumentId`), `backend/src/middleware/upload.ts` (array upload), `backend/src/controllers/expense.controller.ts` (multi-upload, list, per-doc file, delete-one), `backend/src/routes/expense.routes.ts` (new routes), `frontend/src/lib/expenses-api.ts` (new API fns)

**Phase 2 — multi-doc / multi-page AI**
- Create: `backend/src/services/ai/document-images.ts` (pure-ish: flatten docs→images with caps), `backend/src/services/ai/kimi-request.ts` (pure: build messages payload)
- Modify: `backend/src/services/ai/document-image.ts` (render up to 3 PDF pages), `backend/src/services/ai/extraction.ts` (`ExtractionInput.documentIds`), `backend/src/services/ai/kimi-extractor.ts` (multi-image), `backend/src/services/ai/expense-extractor.ts` (mock multi-doc), `backend/src/services/expenseAnalysis.service.ts` (thread documentIds, store on row), `backend/src/types/expenseAnalysis.types.ts` (`documentIds?: string[]`)

**Phase 3 — relaxed creation**
- Modify: `backend/src/validation/expense.schema.ts` (optional fields on AI path), `backend/src/services/expense.service.ts` (`CreateExpenseInput` optional + defaults; submit-gate validation), `backend/src/controllers/expense.controller.ts` (submit gate), `backend/src/services/expenseAnalysis.service.ts` (description backfill on confirm)

**Phase 4 — upload-first frontend**
- Create: `frontend/src/components/expenses/ReceiptDropzone.tsx`, `frontend/src/components/expenses/receipt-dropzone.utils.ts` (pure validation), `frontend/src/styles/expense-theme.css` (scoped indigo/violet tokens)
- Modify: `frontend/src/pages/expenses/SubmitExpensePage.tsx` (rebuild)

**Phase 5 — verification refresh**
- Create: `frontend/src/components/expenses/ReceiptStrip.tsx` (multi-doc thumbnails)
- Modify: `frontend/src/pages/expenses/ExpenseVerificationPage.tsx`, `frontend/src/components/expenses/ReceiptPreview.tsx` (optional per-doc), styling

**Phase 6 — adoption analytics**
- Modify: `backend/src/types/reports.types.ts` (extend `AiAnalysisRow` + `AiAnalyticsReport`), `backend/src/services/reports.aggregate.ts` (`buildAiAnalytics` adoption fields), `backend/src/services/reports.service.ts` (map new row fields), `frontend/src/types/reports.ts`, `frontend/src/components/reports/AiAnalyticsTab.tsx` (display); `backend/src/services/expense.service.ts` (`creationMethod` on create)

---

## Phase 1 — Backend multi-file document foundation

**Outcome:** An expense can hold up to 5 documents. New endpoints list/stream/delete individual documents; multi-file upload works; the singular `documentId` and all legacy endpoints are untouched. App stays fully working (frontend still uploads one file via the existing single-file call until Phase 4).

**Backward-compat risks:** (1) `documentIds` absent on old rows → mitigated by `deriveDocumentIds` helper. (2) Changing multer to `.array` could break the existing single-file path → keep field name `files` AND accept legacy `file`; existing frontend uses `file` (Phase 4 switches it). **Mitigation:** accept both fields. (3) Deleting the primary doc must re-point `documentId`.

**Rollback:** Revert the phase commit. No schema migration to undo (additive fields; old reads ignore `documentIds`).

### Task 1.1: Add `documentIds` to types + a pure derive helper

**Files:**
- Modify: `backend/src/types/expense.types.ts` (add field to `ExpenseDocument` and `Expense`)
- Create: `backend/src/services/expense-documents.read.ts`
- Test: `backend/src/services/expense-documents.read.test.ts`

**Interfaces:**
- Produces: `deriveDocumentIds(expense: { documentId?: string; documentIds?: string[] }): string[]` — returns `documentIds` if non-empty, else `[documentId]` if set, else `[]`.

- [ ] **Step 1: Write the failing test** — `backend/src/services/expense-documents.read.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { deriveDocumentIds } from "./expense-documents.read";

describe("deriveDocumentIds", () => {
  it("prefers documentIds when present", () => {
    expect(deriveDocumentIds({ documentId: "a", documentIds: ["b", "c"] }))
      .toEqual(["b", "c"]);
  });
  it("falls back to the single documentId for legacy rows", () => {
    expect(deriveDocumentIds({ documentId: "a" })).toEqual(["a"]);
  });
  it("returns [] when there is no document", () => {
    expect(deriveDocumentIds({})).toEqual([]);
    expect(deriveDocumentIds({ documentIds: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `cd backend && npx vitest run src/services/expense-documents.read.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `backend/src/services/expense-documents.read.ts`

```ts
/** Resolve the effective document-id list for an expense, back-compat with the
 *  legacy single `documentId`. Prefers `documentIds`; falls back to `[documentId]`. */
export function deriveDocumentIds(expense: {
  documentId?: string;
  documentIds?: string[];
}): string[] {
  if (expense.documentIds && expense.documentIds.length > 0) {
    return expense.documentIds;
  }
  return expense.documentId ? [expense.documentId] : [];
}
```

- [ ] **Step 4: Add the type fields** — in `backend/src/types/expense.types.ts`, add to BOTH `ExpenseDocument` and `Expense` interfaces, right after `documentId?: string;`:

```ts
  /** All attached documents (primary first). `documentId` mirrors documentIds[0]. */
  documentIds?: string[];
```

- [ ] **Step 5: Run test + typecheck** — `cd backend && npx vitest run src/services/expense-documents.read.test.ts` → PASS; `npm run typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/expense-documents.read.ts backend/src/services/expense-documents.read.test.ts backend/src/types/expense.types.ts
git commit -m "feat(expenses): add documentIds field + deriveDocumentIds helper"
```

### Task 1.2: Document service — list all + delete one + update primary

**Files:**
- Modify: `backend/src/services/expense-document.service.ts`
- Modify: `backend/src/services/expense.service.ts`

**Interfaces:**
- Produces (`expense-document.service.ts`): `listExpenseDocuments(expenseId: string): Promise<ExpenseFileView[]>` (query `expenseDocuments` where `expenseId == id`, ordered by `uploadedAt` asc).
- Produces (`expense.service.ts`): `addExpenseDocumentId(expenseId: string, documentId: string): Promise<void>` (append to `documentIds` via `FieldValue.arrayUnion`, set `documentId` if unset); `removeExpenseDocumentId(expenseId: string, documentId: string): Promise<void>` (`arrayRemove`; re-point `documentId` to the new first element or delete it if none).

- [ ] **Step 1: Implement `listExpenseDocuments`** in `expense-document.service.ts` (after `getExpenseDocumentMeta`):

```ts
/** All document metadata for an expense, oldest first (primary first). */
export async function listExpenseDocuments(
  expenseId: string,
): Promise<ExpenseFileView[]> {
  const snap = await db
    .collection(DOCUMENTS_COLLECTION)
    .where("expenseId", "==", expenseId)
    .orderBy("uploadedAt", "asc")
    .get();
  return snap.docs.map((d) =>
    toFileView({ id: d.id, ...(d.data() as Omit<ExpenseFileDocument, "id">) }),
  );
}
```

- [ ] **Step 2: Update `fileUrl` to be per-document** — the legacy view URL points at `/document/file` (primary). Add a per-doc URL field is NOT needed (frontend builds `/documents/:docId/file`); leave `toFileView` as-is but confirm `id` is present so the client can build the per-doc URL.

- [ ] **Step 3: Implement `addExpenseDocumentId` / `removeExpenseDocumentId`** in `expense.service.ts`. Find the existing `setExpenseDocumentId` and add beside it:

```ts
/** Append a document to the expense's list; set it primary if none yet. */
export async function addExpenseDocumentId(
  expenseId: string,
  documentId: string,
): Promise<void> {
  const ref = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const snap = await ref.get();
  const data = snap.data() as ExpenseDocument | undefined;
  await ref.update({
    documentIds: FieldValue.arrayUnion(documentId),
    ...(data?.documentId ? {} : { documentId }),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Remove a document from the expense; re-point or clear the primary pointer. */
export async function removeExpenseDocumentId(
  expenseId: string,
  documentId: string,
): Promise<void> {
  const ref = db.collection(EXPENSES_COLLECTION).doc(expenseId);
  const snap = await ref.get();
  const data = snap.data() as ExpenseDocument | undefined;
  const remaining = (data?.documentIds ?? []).filter((d) => d !== documentId);
  const updates: Record<string, unknown> = {
    documentIds: FieldValue.arrayRemove(documentId),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data?.documentId === documentId) {
    if (remaining[0]) updates.documentId = remaining[0];
    else updates.documentId = FieldValue.delete();
  }
  await ref.update(updates);
}
```

(Ensure `FieldValue` and `ExpenseDocument` are imported in `expense.service.ts`; `FieldValue` already is.)

- [ ] **Step 4: Typecheck** — `cd backend && npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/expense-document.service.ts backend/src/services/expense.service.ts
git commit -m "feat(expenses): list documents + add/remove document-id helpers"
```

### Task 1.3: Multi-file upload middleware (accepts `files[]` and legacy `file`)

**Files:**
- Modify: `backend/src/middleware/upload.ts`

**Interfaces:**
- Produces: `uploadReceipts` middleware (array, up to 5, field `files`; also maps a single legacy `file`). Keep existing `uploadReceipt` export for back-compat until Phase 4 removes its last caller.

- [ ] **Step 1: Add the array uploader.** Replace the `multerUpload` + `uploadReceipt` block, keeping `uploadReceipt` working:

```ts
export const MAX_DOCS = 5;

const fields = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_DOCS },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type. Allowed: JPG, JPEG, PNG, WEBP, PDF"));
  },
}).fields([
  { name: "files", maxCount: MAX_DOCS },
  { name: "file", maxCount: 1 },
]);

/** Parse one-or-many multipart files. Populates `req.files` (array) by merging
 *  the `files[]` and legacy `file` fields. Maps multer errors to HTTP responses. */
export function uploadReceipts(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  fields(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large (max 5 MB)" });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({ error: `Too many files (max ${MAX_DOCS})` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid upload" });
      return;
    }
    const grouped = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    (req as Request & { uploaded?: Express.Multer.File[] }).uploaded = [
      ...(grouped.files ?? []),
      ...(grouped.file ?? []),
    ];
    next();
  });
}
```

Keep the original `uploadReceipt` (single) export intact below — it is still wired in routes for `/documents` until we switch the route to `uploadReceipts` in the next task.

- [ ] **Step 2: Typecheck** — `cd backend && npm run typecheck` → no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/upload.ts
git commit -m "feat(expenses): multi-file upload middleware (files[] + legacy file)"
```

### Task 1.4: Controller + routes — multi-upload, list, per-doc file, delete-one

**Files:**
- Modify: `backend/src/controllers/expense.controller.ts`
- Modify: `backend/src/routes/expense.routes.ts`

**Interfaces:**
- Produces controllers: `postExpenseDocuments` (replaces single handler logic; saves each file, enforces 5-doc cap counting existing, returns `ExpenseFileView[]`), `getExpenseDocuments` (list), `getExpenseDocumentFileById` (stream one by `:docId` with access check), `deleteExpenseDocumentById`.

- [ ] **Step 1: Rewrite the upload handler** as `postExpenseDocuments` in `expense.controller.ts`. It reads `req.uploaded`, enforces the cap against existing docs, appends (does NOT delete prior docs — multi-file accumulates), invalidates analysis, returns all new views:

```ts
export async function postExpenseDocuments(
  req: Request,
  res: Response,
): Promise<Response> {
  const uploaded =
    (req as Request & { uploaded?: Express.Multer.File[] }).uploaded ?? [];
  if (!req.user) {
    await Promise.all(uploaded.map(discardUpload));
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (expense.employeeId !== req.user.userId) {
      await Promise.all(uploaded.map(discardUpload));
      return res.status(403).json({ error: "You can only attach documents to your own expenses" });
    }
    if (expense.approvalStatus !== "DRAFT" && expense.approvalStatus !== "REJECTED") {
      await Promise.all(uploaded.map(discardUpload));
      return res.status(400).json({ error: "Cannot attach a document to a submitted or reviewed expense" });
    }
    if (uploaded.length === 0) {
      return res.status(400).json({ error: "At least one file is required" });
    }
    const existing = deriveDocumentIds(expense).length;
    if (existing + uploaded.length > MAX_DOCS) {
      await Promise.all(uploaded.map(discardUpload));
      return res.status(400).json({ error: `Too many documents (max ${MAX_DOCS})` });
    }

    const views: ExpenseFileView[] = [];
    for (const f of uploaded) {
      const view = await saveExpenseDocument({
        expenseId: id,
        uploadedBy: req.user.userId,
        fileName: f.filename,
        originalFileName: f.originalname,
        mimeType: f.mimetype,
        fileSize: f.size,
      });
      await addExpenseDocumentId(id, view.id);
      views.push(view);
    }
    // New documents invalidate any prior analysis (it described a different set).
    await deleteAnalysisForExpense(id);
    return res.status(201).json(views);
  } catch (err) {
    await Promise.all(uploaded.map(discardUpload));
    return handleError(res, err);
  }
}
```

Add imports: `deriveDocumentIds` from `../services/expense-documents.read`, `MAX_DOCS` from `../middleware/upload`, `addExpenseDocumentId`, `removeExpenseDocumentId` from `../services/expense.service`, `listExpenseDocuments` + `resolveExpenseDocumentFile` + `getDocumentById` from `../services/expense-document.service`.

- [ ] **Step 2: Add list / per-doc-file / delete handlers** in the same controller:

```ts
/** GET /expenses/:id/documents — all attached documents (metadata). */
export async function getExpenseDocuments(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) {
      return res.status(403).json({ error: "You do not have access to this expense" });
    }
    return res.status(200).json({ data: await listExpenseDocuments(id) });
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/:id/documents/:docId/file — stream one document's bytes. */
export async function getExpenseDocumentFileById(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    const { id, docId } = req.valid?.params as IdParams & { docId: string };
    const expense = await requireExpense(id);
    if (!canView(expense, req.user)) { res.status(403).json({ error: "No access" }); return; }
    const doc = await getDocumentById(docId);
    if (!doc || doc.expenseId !== id) { res.status(404).json({ error: "Document not found" }); return; }
    const file = await resolveExpenseDocumentFile(docId);
    const disposition = req.query.download === "1" ? "attachment" : "inline";
    const safeName = file.originalFileName.replace(/["\\]/g, "_");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
    file.stream().pipe(res);
  } catch (err) { handleError(res, err); }
}

/** DELETE /expenses/:id/documents/:docId — remove one document (DRAFT/REJECTED only). */
export async function deleteExpenseDocumentById(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id, docId } = req.valid?.params as IdParams & { docId: string };
    const expense = await requireExpense(id);
    if (expense.employeeId !== req.user.userId) {
      return res.status(403).json({ error: "You can only edit your own expenses" });
    }
    if (expense.approvalStatus !== "DRAFT" && expense.approvalStatus !== "REJECTED") {
      return res.status(400).json({ error: "Cannot modify a submitted or reviewed expense" });
    }
    const doc = await getDocumentById(docId);
    if (!doc || doc.expenseId !== id) return res.status(404).json({ error: "Document not found" });
    await deleteExpenseDocument(docId);
    await removeExpenseDocumentId(id, docId);
    await deleteAnalysisForExpense(id);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}
```

- [ ] **Step 3: Add the param schema** — in `backend/src/validation/expense.schema.ts` add:

```ts
/** Params for /expenses/:id/documents/:docId */
export const expenseDocParams = z.object({ id: firestoreId, docId: firestoreId });
```

- [ ] **Step 4: Wire routes** in `expense.routes.ts`. Change the existing `/:id/documents` POST to use `uploadReceipts` + `postExpenseDocuments`, and add the three new routes (register `/:id/documents` GET before nothing conflicting; `/:id/documents/:docId/file` and DELETE):

```ts
router.post(
  "/:id/documents",
  authenticate, authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  uploadReceipts, postExpenseDocuments,
);
router.get(
  "/:id/documents",
  authenticate, authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getExpenseDocuments,
);
router.get(
  "/:id/documents/:docId/file",
  authenticate, authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: expenseDocParams }),
  getExpenseDocumentFileById,
);
router.delete(
  "/:id/documents/:docId",
  authenticate, authorize(UserRole.EMPLOYEE),
  validate({ params: expenseDocParams }),
  deleteExpenseDocumentById,
);
```

Update imports: replace `uploadReceipt` with `uploadReceipts`, swap `postExpenseDocument` for `postExpenseDocuments`, add the new controller fns and `expenseDocParams`.

- [ ] **Step 5: Typecheck + run full backend tests** — `cd backend && npm run typecheck && npm test` → no errors, existing tests pass.

- [ ] **Step 6: Manual verification** — start backend (`cd backend && npm run dev`), then:

```bash
# (with a valid EMPLOYEE token $T and a draft $E)
curl -s -H "Authorization: Bearer $T" -F "files=@a.jpg" -F "files=@b.pdf" \
  http://localhost:3000/api/expenses/$E/documents | jq 'length'   # => 2
curl -s -H "Authorization: Bearer $T" http://localhost:3000/api/expenses/$E/documents | jq '.data | length'  # => 2
```

Expected: 2 documents listed; `GET /expenses/$E/document` (legacy) still returns the primary.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/expense.controller.ts backend/src/routes/expense.routes.ts backend/src/validation/expense.schema.ts
git commit -m "feat(expenses): multi-document upload/list/stream/delete endpoints"
```

### Task 1.5: Frontend API surface (no UI yet)

**Files:**
- Modify: `frontend/src/lib/expenses-api.ts`, `frontend/src/types/expense.ts`

**Interfaces:**
- Produces: `uploadExpenseDocuments(id, files: File[]): Promise<ExpenseFileView[]>`, `listExpenseDocuments(id): Promise<ExpenseFileView[]>`, `deleteExpenseDocument(id, docId): Promise<void>`, `fetchExpenseDocByIdObjectUrl(id, docId, download?)`. Add `documentIds?: string[]` to `Expense` type.

- [ ] **Step 1: Add `documentIds` to the `Expense` interface** in `frontend/src/types/expense.ts` after `documentId?: string;`:

```ts
  documentIds?: string[];
```

- [ ] **Step 2: Add API functions** in `expenses-api.ts`:

```ts
/** POST /expenses/:id/documents — multipart, one or many files. */
export async function uploadExpenseDocuments(
  id: string, files: File[],
): Promise<ExpenseFileView[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const { data } = await api.post<ExpenseFileView[]>(`/expenses/${id}/documents`, form);
  return data;
}

/** GET /expenses/:id/documents — all attached documents. */
export async function listExpenseDocuments(id: string): Promise<ExpenseFileView[]> {
  const { data } = await api.get<{ data: ExpenseFileView[] }>(`/expenses/${id}/documents`);
  return data.data;
}

/** DELETE /expenses/:id/documents/:docId */
export async function deleteExpenseDocumentById(id: string, docId: string): Promise<void> {
  await api.delete(`/expenses/${id}/documents/${docId}`);
}

/** Object URL for a specific document's bytes (caller revokes). */
export async function fetchExpenseDocByIdObjectUrl(
  id: string, docId: string, download = false,
): Promise<string> {
  const { data } = await api.get<Blob>(`/expenses/${id}/documents/${docId}/file`, {
    params: download ? { download: 1 } : undefined,
    responseType: "blob",
  });
  return URL.createObjectURL(data);
}
```

- [ ] **Step 3: Typecheck** — `cd frontend && npx tsc -b --noEmit` → no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/expenses-api.ts frontend/src/types/expense.ts
git commit -m "feat(expenses): frontend API for multi-document upload/list/delete"
```

**Phase 1 verification report (run before moving on):**
- `cd backend && npm run typecheck && npm test` → pass.
- `cd frontend && npx tsc -b --noEmit` → pass.
- Manual: upload 2 files, list returns 2, legacy single-doc endpoints still work, delete-one re-points primary.

---

## Phase 2 — Multi-document + multi-page AI analysis

**Outcome:** `POST /expenses/:id/analyze` analyzes ALL attached documents in one Kimi call; PDFs contribute up to 3 page-images; the flattened set is capped at 8 images; one merged result is stored with `documentIds[]`. Single-doc expenses behave exactly as before.

**Backward-compat risks:** (1) `ExtractionInput` gains `documentIds`; keep `documentId` for the mock/legacy path. (2) Analysis row adds `documentIds` but keeps `documentId` (primary) so the audit panel/verify keep working. (3) Claim idempotency now keys on the doc set.

**Rollback:** Revert the commit. Stored analysis rows keep `documentId`; readers unaffected.

### Task 2.1: Render up to 3 PDF pages (pure-ish helper)

**Files:**
- Modify: `backend/src/services/ai/document-image.ts`
- Test: `backend/src/services/ai/document-image.test.ts`

**Interfaces:**
- Produces: `bytesToKimiJpegDataUris(bytes: Buffer, mimeType: string, maxPages?: number): Promise<string[]>` — images → 1 data URI; PDFs → up to `maxPages` (default 3) page data URIs. Keep `bytesToKimiJpegDataUri` (singular, page 1) as a thin wrapper for back-compat.

- [ ] **Step 1: Write a failing test** that a non-PDF image yields exactly one data URI (sharp runs on a real tiny PNG):

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { bytesToKimiJpegDataUris } from "./document-image";

describe("bytesToKimiJpegDataUris", () => {
  it("returns a single JPEG data URI for an image", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
      .png().toBuffer();
    const uris = await bytesToKimiJpegDataUris(png, "image/png");
    expect(uris).toHaveLength(1);
    expect(uris[0]).toMatch(/^data:image\/jpeg;base64,/);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `cd backend && npx vitest run src/services/ai/document-image.test.ts` → FAIL (no export).

- [ ] **Step 3: Implement.** Refactor `document-image.ts`: extract page rasterization to a loop and add the plural function. Replace `pdfFirstPageToPng` usage:

```ts
/** Render up to `maxPages` pages of a PDF to PNG buffers. */
async function pdfPagesToPng(bytes: Buffer, maxPages: number): Promise<Buffer[]> {
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(bytes, { scale: 2 });
  const out: Buffer[] = [];
  for await (const page of doc) {
    out.push(page);
    if (out.length >= maxPages) break;
  }
  if (out.length === 0) throw new Error("PDF has no pages to render");
  return out;
}

async function toJpegDataUri(source: Buffer): Promise<string> {
  const jpeg = await sharp(source)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

/** Convert document bytes to 1..N Kimi-ready JPEG data URIs (PDF → up to maxPages). */
export async function bytesToKimiJpegDataUris(
  bytes: Buffer, mimeType: string, maxPages = 3,
): Promise<string[]> {
  const sources = isPdf(mimeType) ? await pdfPagesToPng(bytes, maxPages) : [bytes];
  return Promise.all(sources.map(toJpegDataUri));
}

/** Back-compat single-image (page 1) wrapper. */
export async function bytesToKimiJpegDataUri(bytes: Buffer, mimeType: string): Promise<string> {
  const [first] = await bytesToKimiJpegDataUris(bytes, mimeType, 1);
  return first!;
}
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run src/services/ai/document-image.test.ts` PASS; `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ai/document-image.ts backend/src/services/ai/document-image.test.ts
git commit -m "feat(ai): render up to 3 PDF pages to images"
```

### Task 2.2: Flatten N documents → capped image list (pure cap logic)

**Files:**
- Create: `backend/src/services/ai/document-images.ts`
- Test: `backend/src/services/ai/document-images.test.ts`

**Interfaces:**
- Produces: `capImages(perDoc: string[][], maxTotal?: number): string[]` — flattens per-document image arrays in order, stopping at `maxTotal` (default 8), `console.warn` when dropping. Also `toKimiImageDataUrisForDocuments(documentIds: string[]): Promise<string[]>` (resolves each doc → images via `resolveExpenseDocumentFile` + `bytesToKimiJpegDataUris`, then `capImages`).

- [ ] **Step 1: Failing test for the pure cap** — `document-images.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { capImages } from "./document-images";

describe("capImages", () => {
  it("flattens per-doc images in order", () => {
    expect(capImages([["a", "b"], ["c"]])).toEqual(["a", "b", "c"]);
  });
  it("caps the total and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = capImages([["a", "b", "c"], ["d", "e", "f"]], 4);
    expect(out).toEqual(["a", "b", "c", "d"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/services/ai/document-images.test.ts` → FAIL.

- [ ] **Step 3: Implement** `document-images.ts`:

```ts
import { resolveExpenseDocumentFile } from "../expense-document.service";
import { bytesToKimiJpegDataUris } from "./document-image";

export const MAX_KIMI_IMAGES = 8;

/** Flatten per-document image lists in order, capped to maxTotal. Warns on drop. */
export function capImages(perDoc: string[][], maxTotal = MAX_KIMI_IMAGES): string[] {
  const flat: string[] = [];
  for (const imgs of perDoc) {
    for (const img of imgs) {
      if (flat.length >= maxTotal) {
        console.warn(
          `Kimi image cap reached (${maxTotal}); dropping extra page images.`,
        );
        return flat;
      }
      flat.push(img);
    }
  }
  return flat;
}

/** Resolve all documents to a capped, ordered list of Kimi-ready image data URIs. */
export async function toKimiImageDataUrisForDocuments(
  documentIds: string[],
): Promise<string[]> {
  const perDoc = await Promise.all(
    documentIds.map(async (docId) => {
      const file = await resolveExpenseDocumentFile(docId);
      const bytes = await file.read();
      return bytesToKimiJpegDataUris(bytes, file.mimeType);
    }),
  );
  return capImages(perDoc);
}
```

- [ ] **Step 4: Run test + typecheck** → PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ai/document-images.ts backend/src/services/ai/document-images.test.ts
git commit -m "feat(ai): flatten N documents to a capped image list"
```

### Task 2.3: Build the multi-image Kimi request (pure) + multi-image call

**Files:**
- Create: `backend/src/services/ai/kimi-request.ts`
- Test: `backend/src/services/ai/kimi-request.test.ts`
- Modify: `backend/src/services/ai/kimi-extractor.ts`

**Interfaces:**
- Produces: `buildKimiMessages(dataUris: string[]): Array<{role, content}>` — system prompt (multi-image aware) + one user turn with a text part and one `image_url` part per URI. `kimiExtractFromDataUris(dataUris: string[]): Promise<KimiCallResult>`.

- [ ] **Step 1: Failing test** for the message builder — `kimi-request.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildKimiMessages } from "./kimi-request";

describe("buildKimiMessages", () => {
  it("adds one image part per data URI plus a text part", () => {
    const msgs = buildKimiMessages(["data:image/jpeg;base64,A", "data:image/jpeg;base64,B"]);
    const user = msgs.find((m) => m.role === "user")!;
    const parts = user.content as Array<{ type: string }>;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts.filter((p) => p.type === "text")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, verify fail.** → FAIL.

- [ ] **Step 3: Implement** `kimi-request.ts` (move `SYSTEM_PROMPT` here, extend it for multi-image):

```ts
export const SYSTEM_PROMPT =
  "You are an expense-receipt extraction engine. You may receive MULTIPLE images " +
  "or pages for a SINGLE expense (multi-page invoice, receipt plus supporting " +
  "document). Reconcile them into ONE result. Return ONLY a strict JSON object — " +
  "no prose, no markdown fences. Use this exact shape, with null for any field you " +
  "cannot read:\n" +
  `{"vendorName": string|null, "amount": number|null, "transactionDate": "YYYY-MM-DD"|null, ` +
  `"currency": string|null, "paymentMethod": string|null, "category": string|null, ` +
  `"taxInformation": string|null, "lowConfidenceReason": string|null, "confidenceScore": number}\n` +
  "amount is the single grand total across all pages with no currency symbol. " +
  "confidenceScore is an integer 0-100. When below 70, set lowConfidenceReason to a " +
  "brief explanation; otherwise null.";

export interface ChatMessage {
  role: "system" | "user";
  content: string | Array<Record<string, unknown>>;
}

/** Build the chat messages for a multi-image extraction request. */
export function buildKimiMessages(dataUris: string[]): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: "Extract the expense data from these document image(s)." },
        ...dataUris.map((url) => ({ type: "image_url", image_url: { url } })),
      ],
    },
  ];
}
```

- [ ] **Step 4: Wire `kimi-extractor.ts` to multi-image.** Import `buildKimiMessages` (remove the local `SYSTEM_PROMPT`), add `kimiExtractFromDataUris`, and switch `extract` to use `documentIds`:

```ts
import { buildKimiMessages } from "./kimi-request";
import { toKimiImageDataUrisForDocuments } from "./document-images";
// ...delete the local SYSTEM_PROMPT constant...

export async function kimiExtractFromDataUris(dataUris: string[]): Promise<KimiCallResult> {
  // ...identical to kimiExtractFromDataUri but body.messages = buildKimiMessages(dataUris)...
}

export const kimiExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const ids = input.documentIds ?? (input.documentId ? [input.documentId] : []);
    const dataUris = await toKimiImageDataUrisForDocuments(ids);
    const { result } = await kimiExtractFromDataUris(dataUris);
    return result;
  },
};
```

Keep `kimiExtractFromDataUri` (singular) delegating to `kimiExtractFromDataUris([dataUri])` so the CLI harness (`try-kimi.ts`) and `kimi-extractor.test` keep compiling. (Refactor the existing fetch body to read `messages: buildKimiMessages(dataUris)`.)

- [ ] **Step 5: Run all AI tests + typecheck** — `cd backend && npx vitest run src/services/ai && npm run typecheck` → pass. Fix any reference to the moved `SYSTEM_PROMPT` in tests/CLI.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/kimi-request.ts backend/src/services/ai/kimi-request.test.ts backend/src/services/ai/kimi-extractor.ts
git commit -m "feat(ai): multi-image Kimi request + merged extraction"
```

### Task 2.4: Thread `documentIds` through extraction input + analysis service + mock

**Files:**
- Modify: `backend/src/services/ai/extraction.ts`, `backend/src/services/ai/expense-extractor.ts`, `backend/src/services/expenseAnalysis.service.ts`, `backend/src/types/expenseAnalysis.types.ts`

**Interfaces:**
- Modifies `ExtractionInput` → add `documentIds?: string[]` (keep `documentId`). Analysis row/view gain `documentIds?: string[]`. `analyzeExpense` resolves all docs and passes them down.

- [ ] **Step 1: Extend `ExtractionInput`** in `extraction.ts`:

```ts
export interface ExtractionInput {
  expenseId: string;
  documentId: string;        // primary (back-compat)
  documentIds?: string[];    // full set for multi-doc analysis
}
```

- [ ] **Step 2: Update the mock extractor** (`expense-extractor.ts`) so it tolerates `documentIds` (it already returns synthetic data; just ensure it doesn't break if `documentId` is empty — use the first of `documentIds` when present). Read the file and adjust its `extract` to derive a stable id from `documentIds?.[0] ?? documentId`.

- [ ] **Step 3: Add `documentIds` to analysis types** (`expenseAnalysis.types.ts`) on both `ExpenseAnalysisDocument` and `ExpenseAnalysis`, after `documentId: string;`:

```ts
  /** All analyzed documents (primary mirrored in documentId). */
  documentIds?: string[];
```

- [ ] **Step 4: Thread through `expenseAnalysis.service.ts`.** In `analyzeExpense`, replace the single-doc guard/claim with the doc set:

```ts
import { deriveDocumentIds } from "./expense-documents.read";
// ...
const documentIds = deriveDocumentIds(expense);
if (documentIds.length === 0) {
  const id = await upsertPending(expenseId, "");
  await setFailed(id, "No document to analyze");
  const failed = await loadDocById(id);
  return toView(failed!);
}
const primary = documentIds[0]!;
const provider = getAiConfig().provider;
const claim = await claimForRun(expenseId, primary, provider, documentIds);
if (claim.claimed) {
  void runAnalysis(claim.id, expenseId, primary, documentIds).catch((err) => {
    console.error("Analysis worker crashed:", err);
  });
}
```

Update `claimForRun` to accept + store `documentIds` (write it in `create`/`reclaim` alongside `documentId`). Update `runAnalysis(id, expenseId, documentId, documentIds)` to call `extractor.extract({ expenseId, documentId, documentIds })` and to write `documentIds` into the result update object:

```ts
documentIds,
```

- [ ] **Step 5: Run backend tests + typecheck** — `cd backend && npm test && npm run typecheck` → pass.

- [ ] **Step 6: Manual verification** (mock provider is fine — set `AI_PROVIDER=mock` if configured, else real Kimi): upload 2 docs to a draft, `POST /analyze`, poll `GET /analysis` → status COMPLETED/LOW_CONFIDENCE and the row has `documentIds` length 2.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/ai/extraction.ts backend/src/services/ai/expense-extractor.ts backend/src/services/expenseAnalysis.service.ts backend/src/types/expenseAnalysis.types.ts
git commit -m "feat(ai): analyze all documents per expense (merged)"
```

**Phase 2 verification report:** backend `npm test` + `npm run typecheck` pass; manual 2-doc analyze returns a merged result with `documentIds`; single-doc analyze unchanged; multi-page PDF contributes ≤3 images; cap warns at 8.

---

## Phase 3 — Relaxed creation validation + description backfill

**Outcome:** An AI-path draft can be created with only scope/project (+ files uploaded separately); amount/date/category/description are optional and defaulted. The manual path is unchanged. Submitting requires amount>0, a date, and a category (the verify/confirm step supplies them). On confirm, a blank description is backfilled from the vendor.

**Backward-compat risks:** Relaxing `createExpenseBody` could let an incomplete expense be submitted directly. **Mitigation:** add a submit-time gate. The manual path still sends all fields and behaves as today.

**Rollback:** Revert commit; creation re-tightens. No data migration.

### Task 3.1: Relax `createExpenseBody`; default missing fields server-side

**Files:**
- Modify: `backend/src/validation/expense.schema.ts`, `backend/src/services/expense.service.ts`
- Test: `backend/src/validation/expense.schema.test.ts` (create if absent)

**Interfaces:**
- `createExpenseBody` makes `amount`, `category`, `expenseDate`, `description` optional; `type` defaults to `DOCUMENT`. `CreateExpenseInput` fields become optional; `createExpense` defaults: `amount ?? 0`, `category ?? "MISCELLANEOUS"`, `expenseDate ?? <server today>`, `description ?? ""`, `type ?? "DOCUMENT"`.

- [ ] **Step 1: Failing schema test:**

```ts
import { describe, expect, it } from "vitest";
import { createExpenseBody } from "./expense.schema";

describe("createExpenseBody (AI path)", () => {
  it("accepts a minimal project draft with no amount/date/category", () => {
    const r = createExpenseBody.safeParse({ scope: "PROJECT", projectId: "p".repeat(20), isDraft: true });
    expect(r.success).toBe(true);
  });
  it("still requires projectId for PROJECT scope", () => {
    const r = createExpenseBody.safeParse({ scope: "PROJECT", isDraft: true });
    expect(r.success).toBe(false);
  });
});
```

(Adjust the `"p".repeat(20)` to satisfy `firestoreId` min length if different — check `validation/common.ts`.)

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Relax the schema:**

```ts
export const createExpenseBody = z
  .object({
    scope: scopeSchema,
    projectId: firestoreId.optional(),
    type: typeSchema.default("DOCUMENT"),
    category: categorySchema.optional(),
    amount: z.number().finite().positive().optional(),
    currency: z.string().trim().min(1).max(8).default("INR"),
    description: z.string().trim().max(2000).optional(),
    expenseDate: dateString.optional(),
    isDraft: z.boolean().optional().default(false),
  })
  .strict()
  .refine(
    (v) => v.scope !== "PROJECT" || (!!v.projectId && v.projectId.length > 0),
    { message: "projectId is required for PROJECT expenses", path: ["projectId"] },
  );
```

- [ ] **Step 4: Default in `createExpense`** — make `CreateExpenseInput`'s `amount/category/expenseDate/description/type` optional and apply defaults in the `data` object:

```ts
type: input.type ?? "DOCUMENT",
category: input.category ?? "MISCELLANEOUS",
amount: input.amount ?? 0,
description: (input.description ?? "").trim(),
expenseDate: input.expenseDate ?? new Date().toISOString().slice(0, 10),
```

(Also set `creationMethod` here — see Phase 6 Task 6.0; if doing phases in order, add the field now: `creationMethod: input.type === "CASH" ? "MANUAL" : "AI"` — refine in Phase 6.)

- [ ] **Step 5: Run schema test + typecheck + full backend tests.** Update the controller `postExpense` mapping if it passes fields explicitly (ensure optional fields flow through).

- [ ] **Step 6: Commit**

```bash
git add backend/src/validation/expense.schema.ts backend/src/validation/expense.schema.test.ts backend/src/services/expense.service.ts
git commit -m "feat(expenses): relax creation validation for AI-first drafts"
```

### Task 3.2: Submit-time completeness gate

**Files:**
- Modify: `backend/src/services/expense.service.ts` (the submit function — find `submitExpense`/`setSubmitted`)
- Test: extend `expense.schema.test.ts` is not enough; add a small pure validator + test.

**Interfaces:**
- Produces: `assertSubmittable(expense: { amount?: number; category?: string; expenseDate?: string })` throwing `ApiError(400, ...)` when amount missing/≤0, category missing, or date missing. Called inside the submit path.

- [ ] **Step 1: Failing test** — `backend/src/services/expense.submit-gate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertSubmittable } from "./expense.submit-gate";

describe("assertSubmittable", () => {
  it("rejects a zero amount", () => {
    expect(() => assertSubmittable({ amount: 0, category: "TRAVEL", expenseDate: "2026-06-19" }))
      .toThrow(/amount/i);
  });
  it("accepts a complete expense", () => {
    expect(() => assertSubmittable({ amount: 10, category: "TRAVEL", expenseDate: "2026-06-19" }))
      .not.toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `expense.submit-gate.ts`:

```ts
import { ApiError } from "../utils/errors";

/** Guard a draft before it leaves DRAFT/REJECTED: AI-first drafts may have been
 *  created without these, so enforce them at submit. */
export function assertSubmittable(expense: {
  amount?: number; category?: string; expenseDate?: string;
}): void {
  if (typeof expense.amount !== "number" || expense.amount <= 0) {
    throw new ApiError(400, "An amount greater than zero is required before submitting.");
  }
  if (!expense.category) throw new ApiError(400, "A category is required before submitting.");
  if (!expense.expenseDate) throw new ApiError(400, "An expense date is required before submitting.");
}
```

- [ ] **Step 4: Call it in the submit path.** In `expense.service.ts` submit function, after loading the expense and before flipping status to SUBMITTED, add `assertSubmittable(expense);` (import it).

- [ ] **Step 5: Run tests + typecheck.**

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/expense.submit-gate.ts backend/src/services/expense.submit-gate.test.ts backend/src/services/expense.service.ts
git commit -m "feat(expenses): enforce completeness at submit time"
```

### Task 3.3: Description backfill from vendor on confirm

**Files:**
- Modify: `backend/src/services/expenseAnalysis.service.ts` (the `confirm` block in `updateAnalysis`)

- [ ] **Step 1: Implement.** In the `if (patch.confirm) {` block, after computing `category`, add a description backfill when the expense currently has none:

```ts
const vendor = patch.vendorName ?? doc.vendorName;
if (vendor && (!expense.description || expense.description.trim() === "")) {
  writeBack.description = vendor;
}
```

(`expense` is already loaded as `await requireExpense(expenseId)` at the top of `updateAnalysis`; `UpdateExpenseInput` already allows `description`.)

- [ ] **Step 2: Typecheck + backend tests** → pass.

- [ ] **Step 3: Manual verification:** create a minimal AI draft (no description), analyze, confirm → the expense `description` equals the vendor name; amount/date/category populated.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/expenseAnalysis.service.ts
git commit -m "feat(expenses): backfill description from vendor on confirm"
```

**Phase 3 verification report:** minimal draft creates; cannot submit until complete; confirm backfills description + writes amount/date/category; manual path still works.

---

## Phase 4 — Frontend upload-first experience

**Outcome:** `SubmitExpensePage` leads with a multi-file `ReceiptDropzone`, shows only required fields (Project + Receipt) with `*`/helper text, hides description, transitions the primary CTA Upload→Analyze, and offers a quiet "No receipt? Enter manually" fallback. Indigo/violet theme applied (scoped). App fully usable.

**Backward-compat risks:** The page now creates the draft first, then uploads files, then routes to analyze. Ensure the manual fallback still sends amount/date/category. Keep "Save Draft".

**Rollback:** Revert commit; the previous page returns (Phase 1-3 backend remains, still compatible with the old single-file UI).

### Task 4.1: Scoped indigo/violet theme tokens

**Files:**
- Create: `frontend/src/styles/expense-theme.css`
- Modify: `frontend/src/index.css` (import the scoped file)

- [ ] **Step 1: Create** `expense-theme.css` with a wrapper class (no global token override):

```css
/* Indigo/violet accent scoped to expense screens via .expense-scope wrapper. */
.expense-scope {
  --x-primary: oklch(0.51 0.21 277);      /* indigo-600 */
  --x-primary-foreground: oklch(0.985 0 0);
  --x-ai: oklch(0.62 0.22 300);           /* violet-500 */
  --x-success: oklch(0.70 0.16 162);      /* emerald-500 */
}
.expense-scope .btn-primary {
  background-color: var(--x-primary);
  color: var(--x-primary-foreground);
}
.expense-scope .ring-ai { box-shadow: 0 0 0 2px var(--x-ai); }
.expense-scope .text-ai { color: var(--x-ai); }
.expense-scope .text-success { color: var(--x-success); }
```

- [ ] **Step 2: Import it** — add to `index.css` after the existing imports: `@import "./styles/expense-theme.css";`

- [ ] **Step 3: Verify build** — `cd frontend && npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/expense-theme.css frontend/src/index.css
git commit -m "feat(expenses): scoped indigo/violet theme tokens"
```

### Task 4.2: `ReceiptDropzone` component + pure validation

**Files:**
- Create: `frontend/src/components/expenses/receipt-dropzone.utils.ts`, `frontend/src/components/expenses/ReceiptDropzone.tsx`
- Test: `frontend/src/components/expenses/receipt-dropzone.utils.test.ts`

**Interfaces:**
- Produces (utils): `validateFiles(incoming: File[], existingCount: number): { accepted: File[]; errors: string[] }` — enforces MIME allow-list, 5 MB each, 5 total.
- Produces (component): `ReceiptDropzone({ files, onChange, max }: { files: File[]; onChange: (f: File[]) => void; max?: number })` — drag-and-drop + multi-select, file list with per-file remove + thumbnails.

- [ ] **Step 1: Failing utils test:**

```ts
import { describe, expect, it } from "vitest";
import { validateFiles, ACCEPTED_MIME, MAX_FILES, MAX_BYTES } from "./receipt-dropzone.utils";

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateFiles", () => {
  it("rejects unsupported types", () => {
    const r = validateFiles([file("a.txt", "text/plain", 10)], 0);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors[0]).toMatch(/type/i);
  });
  it("rejects files over 5 MB", () => {
    const r = validateFiles([file("a.jpg", "image/jpeg", MAX_BYTES + 1)], 0);
    expect(r.errors[0]).toMatch(/large/i);
  });
  it("caps total at MAX_FILES", () => {
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) => file(`a${i}.jpg`, "image/jpeg", 10));
    const r = validateFiles(many, 0);
    expect(r.accepted).toHaveLength(MAX_FILES);
    expect(r.errors.some((e) => /max/i.test(e))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `receipt-dropzone.utils.ts`:

```ts
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_FILES = 5;
export const MAX_BYTES = 5 * 1024 * 1024;

export function validateFiles(
  incoming: File[], existingCount: number,
): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];
  let slots = MAX_FILES - existingCount;
  for (const f of incoming) {
    if (!ACCEPTED_MIME.includes(f.type)) { errors.push(`${f.name}: unsupported type`); continue; }
    if (f.size > MAX_BYTES) { errors.push(`${f.name}: too large (max 5 MB)`); continue; }
    if (slots <= 0) { errors.push(`Max ${MAX_FILES} files`); break; }
    accepted.push(f); slots--;
  }
  return { accepted, errors };
}
```

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Implement `ReceiptDropzone.tsx`** — native HTML5 drag-and-drop + `<input type="file" multiple>`, thumbnails via `URL.createObjectURL` for images / a PDF icon, per-file remove. (Full component; uses `validateFiles`, `toast` for errors, lucide `Upload`/`FileText`/`X` icons, revokes object URLs on unmount.)

```tsx
import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { validateFiles, ACCEPTED_MIME, MAX_FILES } from "./receipt-dropzone.utils";

export function ReceiptDropzone({
  files, onChange, max = MAX_FILES,
}: { files: File[]; onChange: (f: File[]) => void; max?: number }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const urls = useRef<Map<File, string>>(new Map());

  function previewUrl(f: File): string | null {
    if (!f.type.startsWith("image/")) return null;
    if (!urls.current.has(f)) urls.current.set(f, URL.createObjectURL(f));
    return urls.current.get(f)!;
  }
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  function add(incoming: File[]) {
    const { accepted, errors } = validateFiles(incoming, files.length);
    errors.forEach((e) => toast.error(e));
    if (accepted.length) onChange([...files, ...accepted]);
  }
  function remove(idx: number) {
    const f = files[idx];
    const u = f && urls.current.get(f);
    if (u) { URL.revokeObjectURL(u); urls.current.delete(f!); }
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button" tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); add(Array.from(e.dataTransfer.files)); }}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-[var(--x-primary)] bg-[var(--x-primary)]/5" : "border-muted-foreground/25 hover:border-[var(--x-primary)]/60"
        }`}
      >
        <Upload className="size-6 text-ai" />
        <p className="text-sm font-medium">Drag &amp; drop receipts, or click to browse</p>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP, or PDF · max 5 MB each · up to {max} files</p>
      </div>
      <input
        ref={inputRef} type="file" multiple accept={ACCEPTED_MIME.join(",")}
        className="hidden"
        onChange={(e) => { add(Array.from(e.target.files ?? [])); e.target.value = ""; }}
      />
      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative flex items-center gap-2 rounded-md border bg-muted/30 p-2">
              {previewUrl(f)
                ? <img src={previewUrl(f)!} alt="" className="size-10 rounded object-cover" />
                : <FileText className="size-10 p-1 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate text-xs">{f.name}</span>
              <button type="button" onClick={() => remove(i)} aria-label={`Remove ${f.name}`}
                className="rounded p-1 text-muted-foreground hover:text-destructive">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Component render test** (`ReceiptDropzone.test.tsx`) — render with two files, assert both names show and a remove button calls `onChange` with one file. Run `cd frontend && npm test`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/expenses/receipt-dropzone.utils.ts frontend/src/components/expenses/receipt-dropzone.utils.test.ts frontend/src/components/expenses/ReceiptDropzone.tsx frontend/src/components/expenses/ReceiptDropzone.test.tsx
git commit -m "feat(expenses): ReceiptDropzone multi-file component"
```

### Task 4.3: Rebuild `SubmitExpensePage` (upload-first)

**Files:**
- Modify: `frontend/src/pages/expenses/SubmitExpensePage.tsx`

**Interfaces:**
- Consumes: `ReceiptDropzone`, `uploadExpenseDocuments`, `createExpense`, `updateExpense`, `listMyProjects`.

- [ ] **Step 1: Implement the new flow.** Wrap the page in `<div className="expense-scope">`. State: `scope`, `projectId`, `files: File[]`, `manualMode: boolean`, and (manual only) `amount/expenseDate/category/description`. Layout top→bottom: hero `ReceiptDropzone` → "Where does this belong?" (Scope + Project select, each labeled with a red `*` and helper text) → quiet `<button className="link">No receipt? Enter manually</button>` toggling `manualMode` (reveals amount/date/category/description fields). Required gating:

```ts
const aiReady = files.length > 0 && (scope === "GENERAL" || projectId !== "");
const manualReady = !manualMode ? false :
  description.trim() !== "" && expenseDate !== "" && Number(amount) > 0 &&
  (scope === "GENERAL" || projectId !== "");
```

Primary CTA logic:
- AI path, no files staged → label "Upload Receipt" (clicking focuses the dropzone).
- AI path, files staged → label "Analyze Receipt": on click, `createExpense({ scope, projectId?, type: "DOCUMENT", currency: "INR", isDraft: true })`, then `uploadExpenseDocuments(created.id, files)`, then `navigate(\`/employee/expenses/${created.id}/analysis?analyze=1\`)`.
- Manual path → "Save Draft" / "Submit" using the existing full-payload create (`type: "CASH"`), preserving current behavior.

Use the existing `handleSave` structure as a base but split AI vs manual. Apply `.btn-primary`/`.text-ai` classes for the indigo/violet accents; mark required fields with `<span className="text-destructive">*</span>` and helper `<p className="text-xs text-muted-foreground">`.

- [ ] **Step 2: Edit mode** — when `isEdit`, hydrate as today; in edit, files already uploaded are shown via a note ("Manage receipts from the expense page") — keep edit minimal (don't re-upload here); the dropzone is hidden in edit mode to avoid double-management. (Edit of metadata stays via the manual fields.)

- [ ] **Step 3: Typecheck + build + lint** — `cd frontend && npx tsc -b --noEmit && npm run lint` → clean.

- [ ] **Step 4: Manual verification** — `cd frontend && npm run dev` (+ backend running): as EMPLOYEE, upload 2 receipts, click "Analyze Receipt" → lands on analysis → verify → submit. Confirm "No receipt? Enter manually" reveals the legacy fields and a manual cash expense still submits.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/expenses/SubmitExpensePage.tsx
git commit -m "feat(expenses): upload-first Submit Expense page"
```

**Phase 4 verification report:** dropzone validation unit tests pass; AI path creates→uploads→analyzes; manual fallback works; required `*`/helper text present; theme scoped (other pages visually unaffected — spot-check dashboard).

---

## Phase 5 — Verification experience refresh

**Outcome:** `ExpenseVerificationPage` shows a multi-document thumbnail strip (all uploaded docs), confidence framing in the indigo/violet palette, and the editable description field (pre-filled from vendor when blank). Confirm & Submit unchanged in behavior.

**Backward-compat risks:** Single-doc expenses must render exactly one thumbnail. `ReceiptPreview` (used elsewhere) must keep working.

**Rollback:** Revert commit; the two-column verify returns.

### Task 5.1: `ReceiptStrip` multi-document viewer

**Files:**
- Create: `frontend/src/components/expenses/ReceiptStrip.tsx`
- Test: `frontend/src/components/expenses/ReceiptStrip.test.tsx`

**Interfaces:**
- Consumes: `listExpenseDocuments(id)`, `fetchExpenseDocByIdObjectUrl(id, docId)`.
- Produces: `ReceiptStrip({ expenseId }: { expenseId: string })` — fetches the doc list, renders a thumbnail per doc, click → enlarge (object URL in a dialog/new tab). Falls back to the single-doc `ReceiptPreview` look when one doc.

- [ ] **Step 1: Render test** — mock `listExpenseDocuments` to return two views; assert two thumbnail buttons render. (Mock the api module with `vi.mock`.)

- [ ] **Step 2: Implement** the component (fetch list on mount; per-doc lazy object URL on click; revoke on unmount; loading + empty states).

- [ ] **Step 3: Run frontend tests + typecheck.**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/expenses/ReceiptStrip.tsx frontend/src/components/expenses/ReceiptStrip.test.tsx
git commit -m "feat(expenses): multi-document ReceiptStrip viewer"
```

### Task 5.2: Restyle `ExpenseVerificationPage`

**Files:**
- Modify: `frontend/src/pages/expenses/ExpenseVerificationPage.tsx`

- [ ] **Step 1: Swap the left card** to use `<ReceiptStrip expenseId={id} />` instead of `<ReceiptPreview />`. Wrap the page in `expense-scope`. Apply violet→emerald accent to `ConfidenceMeter` framing (pass a className or wrap). Add a **Description** field to the form (`description` in `Form`), hydrated from `analysis.vendorName` when the expense has none; include it in `updateExpenseAnalysis` patch (the backend backfill is a safety net; the UI sends it explicitly).

- [ ] **Step 2: Style pass** — 60/40 grid, rounded cards, indigo primary on "Confirm & Submit" (`.btn-primary`), subtle `text-ai` on the "Verify extracted values" heading and confidence.

- [ ] **Step 3: Typecheck + build + lint** → clean.

- [ ] **Step 4: Manual verification** — verify page shows N thumbnails, confidence framing, description pre-filled; Confirm & Submit writes back and submits.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/expenses/ExpenseVerificationPage.tsx
git commit -m "feat(expenses): refreshed multi-doc verification experience"
```

**Phase 5 verification report:** strip renders 1..N docs; single-doc unchanged; confidence framing styled; description pre-fills; submit works.

---

## Phase 6 — AI adoption analytics

**Outcome:** The existing AI analytics report gains genuinely-new adoption metrics — creation-method split (AI vs manual) and multi-document usage — surfaced in the Reports AI tab. The "AI-accepted vs edited" signal **already exists** as `corrected` / `corrections` / `totals.manualCorrectionRate` and `confirmed`; we reuse those rather than duplicate them. Forward-only: historical rows contribute nulls/zeros.

> **Verified against `reports.types.ts` / `reports.aggregate.ts`:**
> - `buildAiAnalytics(rows: AiAnalysisRow[], ref: Date, months = 12): AiAnalyticsReport` — note the `ref` (Date) and `months` args.
> - `AiAnalysisRow` already has: `status`, `provider?`, `confidenceScore?`, `processingMs?`, `tokensUsed?`, `confirmed: boolean`, `corrected: boolean`, `createdAt: string` (ISO). It does **not** have `edited` or `month`.
> - `AiAnalyticsReport.totals` already includes `confirmed`, `corrected`, `manualCorrectionRate`, and there is a `corrections: { confirmed; corrected; unchanged }` block. **Do not re-add an edit/correction rate.**
> - Forward-only pattern lives in `reports.service.ts:207-211` (typeof guards when mapping docs → rows) and `reports.aggregate.ts:283-286,301-304,351-358` (null when no data).
> - Creation-method split needs expense-side data (the analysis rows don't carry it), so it is computed by a separate pure helper fed from the `expenses` collection — NOT from `AiAnalysisRow`.

**Backward-compat risks:** New fields on `AiAnalysisRow`/`AiAnalyticsReport` must be optional; the aggregator must treat absent fields as defaults and not divide-by-zero. Forward-only: pre-existing analysis rows lack `documentCount` → treated as `1`; pre-existing expenses lack `creationMethod` → counted as `unknown` and excluded from the AI-vs-manual denominator (documented).

**Rollback:** Revert commit; report returns to prior shape (frontend tolerates missing fields).

### Task 6.0: Stamp `creationMethod` on new expenses (forward-only)

**Files:**
- Modify: `backend/src/types/expense.types.ts`, `backend/src/services/expense.service.ts`, `backend/src/controllers/expense.controller.ts`

**Interfaces:**
- `ExpenseDocument`/`Expense` gain `creationMethod?: "AI" | "MANUAL"`. Set on create: `"MANUAL"` when the manual path (`type === "CASH"`), else `"AI"`. (If Task 3.1 already added it, this task only adds the type + report wiring.)

- [ ] **Step 1: Add the type field** to both interfaces:

```ts
  /** How the expense was created — drives AI adoption analytics (forward-only). */
  creationMethod?: "AI" | "MANUAL";
```

- [ ] **Step 2: Set it in `createExpense`** (if not already): `creationMethod: input.type === "CASH" ? "MANUAL" : "AI"`.

- [ ] **Step 3: Typecheck + tests.** Commit:

```bash
git add backend/src/types/expense.types.ts backend/src/services/expense.service.ts backend/src/controllers/expense.controller.ts
git commit -m "feat(reports): stamp creationMethod on new expenses"
```

### Task 6.1: Extend the aggregator with adoption metrics (pure, TDD)

**Files:**
- Modify: `backend/src/types/reports.types.ts`, `backend/src/services/reports.aggregate.ts`
- Test: `backend/src/services/reports.aggregate.test.ts` (extend)

**Interfaces:**
- Extend `AiAnalysisRow` with optional `documentCount?: number` (only new row field; `confirmed`/`corrected` already exist).
- Extend `AiAnalyticsReport` with an `adoption` block: `{ aiCreated: number; manualCreated: number; unknownCreated: number; aiCreatedPct: number | null; multiDocExpenses: number; multiDocPct: number | null }`.
- Add a pure helper `summarizeCreationAdoption(methods: Array<"AI" | "MANUAL" | undefined>, docCounts: number[]): AdoptionSummary` (creation-method counts come from the `expenses` collection, doc counts from analysis rows). `buildAiAnalytics` takes an optional 4th arg `creationMethods` (default `[]`) and folds the result into `adoption`. Keep the existing `(rows, ref, months)` signature working — `creationMethods` is appended last with a default.

- [ ] **Step 1: Failing test** in `reports.aggregate.test.ts` (note real signature: `rows, ref, months, creationMethods`; use a fixed `ref` Date — `Date.now()` is fine in a test file):

```ts
import { buildAiAnalytics } from "./reports.aggregate";
import type { AiAnalysisRow } from "../types/reports.types";

const REF = new Date("2026-06-19T00:00:00Z");
function aiRow(over: Partial<AiAnalysisRow> = {}): AiAnalysisRow {
  return { status: "COMPLETED", confidenceScore: 90, provider: "kimi",
    createdAt: "2026-06-10T00:00:00Z", confirmed: true, corrected: false,
    documentCount: 1, ...over };
}

describe("buildAiAnalytics adoption", () => {
  it("counts multi-document analyses and creation-method split", () => {
    const rows = [aiRow({ documentCount: 3 }), aiRow({ documentCount: 1 })];
    const r = buildAiAnalytics(rows, REF, 12, ["AI", "MANUAL", undefined]);
    expect(r.adoption.multiDocExpenses).toBe(1);
    expect(r.adoption.aiCreated).toBe(1);
    expect(r.adoption.manualCreated).toBe(1);
    expect(r.adoption.unknownCreated).toBe(1);
    expect(r.adoption.aiCreatedPct).toBeCloseTo(50); // AI / (AI+MANUAL), unknown excluded
  });
  it("returns null pct for empty inputs", () => {
    const r = buildAiAnalytics([], REF, 12, []);
    expect(r.adoption.aiCreatedPct).toBeNull();
    expect(r.adoption.multiDocExpenses).toBe(0);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `cd backend && npx vitest run src/services/reports.aggregate.test.ts -t adoption` → FAIL.

- [ ] **Step 3: Extend the types** (`reports.types.ts`) — add `documentCount?: number` to `AiAnalysisRow`; add an `AiAdoption` interface and `adoption: AiAdoption` to `AiAnalyticsReport`:

```ts
export interface AiAdoption {
  aiCreated: number;
  manualCreated: number;
  unknownCreated: number;
  /** AI / (AI + MANUAL) as a percentage; null when none are known. */
  aiCreatedPct: number | null;
  multiDocExpenses: number;
  /** multi-doc analyses / total analyses; null when no analyses. */
  multiDocPct: number | null;
}
```

- [ ] **Step 4: Implement.** Add the pure helper and extend `buildAiAnalytics` (reuse its existing `pct` helper). The signature gains a trailing optional arg so existing callers keep compiling:

```ts
export function buildAiAnalytics(
  rows: AiAnalysisRow[],
  ref: Date,
  months = 12,
  creationMethods: Array<"AI" | "MANUAL" | undefined> = [],
): AiAnalyticsReport {
  // ...existing body...
  // before the return, compute adoption:
  const aiCreated = creationMethods.filter((m) => m === "AI").length;
  const manualCreated = creationMethods.filter((m) => m === "MANUAL").length;
  const unknownCreated = creationMethods.filter((m) => m == null).length;
  const multiDocExpenses = rows.filter((r) => (r.documentCount ?? 1) > 1).length;
  const adoption = {
    aiCreated, manualCreated, unknownCreated,
    aiCreatedPct: pct(aiCreated, aiCreated + manualCreated), // null when denom 0
    multiDocExpenses,
    multiDocPct: pct(multiDocExpenses, rows.length),
  };
  return { /* ...existing fields..., */ adoption };
}
```

(Confirm `pct(n, d)` returns `null` when `d === 0` — it is the same helper already used for `successRate`/`lowConfidencePct`; if it returns `0` instead, special-case the denominator to `null` here.)

- [ ] **Step 5: Run aggregate tests + typecheck** → pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/types/reports.types.ts backend/src/services/reports.aggregate.ts backend/src/services/reports.aggregate.test.ts
git commit -m "feat(reports): AI adoption metrics in aggregator"
```

### Task 6.2: Feed the new fields from `reports.service.ts`

**Files:**
- Modify: `backend/src/services/reports.service.ts`

- [ ] **Step 1: Map `documentCount` on each row** where `getAiAnalyticsReport` builds `AiAnalysisRow[]` from `expenseAnalysis` docs (around `reports.service.ts:198-213`). Following the existing `typeof`-guard pattern, add `documentCount: x.documentIds?.length ?? 1`. Leave `confirmed`/`corrected` (via the existing `hasCorrections(x)`) unchanged — the edit/correction signal already exists.

- [ ] **Step 2: Feed `creationMethods` from the expenses collection.** In `getAiAnalyticsReport`, also read the `expenses` collection and build `creationMethods: Array<"AI"|"MANUAL"|undefined>` from each expense's `creationMethod`. Pass it as the 4th arg: `buildAiAnalytics(rows, ref, months, creationMethods)`. (Reuse the existing Firestore `db` import and the same months/ref the function already computes.)

- [ ] **Step 3: Typecheck + backend tests** → pass.

- [ ] **Step 4: Manual verification** — `GET /reports/ai` as ADMIN; response includes `adoption` with sane numbers.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reports.service.ts
git commit -m "feat(reports): populate adoption fields from analysis + expenses"
```

### Task 6.3: Surface adoption in the Reports AI tab

**Files:**
- Modify: `frontend/src/types/reports.ts`, `frontend/src/lib/reports-api.ts` (if a type mirror is needed), the AI analytics component under `frontend/src/components/reports/`

- [ ] **Step 1: Mirror the types** — add `adoption` to the frontend AI analytics type (optional, to tolerate older backends).

- [ ] **Step 2: Render** an "AI Adoption" card row in the AI tab: AI vs manual created (+ `aiCreatedPct`), multi-document expenses (+ `multiDocPct`). Correction/confirmation are already shown by the existing corrections block — don't duplicate. Use the indigo/violet accent for consistency. Guard for `adoption` undefined (older backend).

- [ ] **Step 3: Typecheck + build + lint** → clean.

- [ ] **Step 4: Manual verification** — open Reports → AI tab → adoption card shows.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/reports.ts frontend/src/components/reports/
git commit -m "feat(reports): display AI adoption metrics"
```

**Phase 6 verification report:** aggregator unit tests pass; endpoint returns `adoption`; AI tab renders it; historical rows don't break rates.

---

## Cross-cutting verification (after Phase 6)

- `cd backend && npm run typecheck && npm test` → all pass.
- `cd frontend && npx tsc -b --noEmit && npm run lint && npm test` → all pass.
- End-to-end manual: minimal AI draft → 2 receipts (1 PDF) → analyze → verify (2 thumbnails, description pre-filled) → submit → HR sees it; manual cash path still works; Reports AI tab shows adoption.
- Firestore indexes: if `GET /documents` ordering by `uploadedAt` needs a composite index, add it to `firestore.indexes.json` and deploy (per Reports-module gotcha).

## Self-review notes (coverage map)

- Spec §1 multi-file backend → Phase 1. Spec §3 AI merge + multi-page PDF → Phase 2. Spec §6/§"relaxed creation" → Phase 3. Spec §2/§4 upload-first + required fields + theme → Phase 4. Spec §5 verify refresh + multi-doc strip → Phase 5. Spec §"AI adoption metrics" → Phase 6. Backward-compat + rollback called out per phase. Description backfill → Task 3.3. 5-doc/3-page/8-image caps → Tasks 1.3/1.4/2.1/2.2. Indigo/violet scoped → Task 4.1.
