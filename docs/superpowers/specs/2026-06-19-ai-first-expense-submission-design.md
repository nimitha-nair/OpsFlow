# AI-First Expense Submission — Design

**Date:** 2026-06-19
**Status:** Approved (pending spec review)
**Owner:** paras@scoreplusits.com

## Goal

Shift the employee expense workflow from manual-entry-first to AI-first:

```
Upload Receipt(s)  →  Analyze (Kimi, all docs merged)  →  Verify  →  Submit
```

The AI (Kimi) becomes the primary source of amount, date, and category. The
employee should never type data the receipt already contains. Manual entry
remains available as a quiet secondary path for genuinely receipt-less expenses.

## Confirmed product decisions

| # | Decision | Choice |
|---|---|---|
| 1 | No-receipt expenses | Keep as a **secondary** path — quiet "No receipt? Enter manually" link reveals legacy fields. |
| 2 | Required fields | **Project + Receipt only** at creation. Amount/date/category come from AI, confirmed in verify. |
| 3 | Color scheme | **Indigo / violet** accent, **scoped to expense screens only** (not app-wide). |
| 4 | Multi-file AI | **Analyze all, AI merges** — all docs sent to Kimi in one call, reconciled into one result. |
| a | Multi-page PDF | **Yes**, render up to **3 pages** per PDF. |
| b | Document cap | **5 documents** per expense. |
| d | Description | **Hidden initially**; auto-populated from vendor name on confirm when blank. |
| e | AI adoption metrics | **Collect** while touching this flow; extend existing AI analytics (forward-only). |

## UX review findings (current flow)

The current `SubmitExpensePage` works against the AI-first goal:

- **Duplicate data entry.** Amount, date, category are typed at creation, then
  re-extracted by Kimi, then re-confirmed in verify — three times for data the
  AI reads once.
- **AI hidden behind a `type` toggle.** "Document" vs "Cash" is what reveals the
  upload field; "Save & Analyze" only appears after everything else is filled.
- **Wrong information order.** The form leads with metadata and ends with the
  receipt. The new flow leads with the receipt.
- **Single file only.** One `documentId` per expense — no multi-page invoices,
  no receipt + supporting document.
- **No required-field signaling.** No `*`, no helper text, no per-field
  validation — one generic "complete all required fields."
- **Plain verify step.** Functional but monochrome; no confidence framing.

**Key enabling fact:** `updateAnalysis(confirm:true)`
(`expenseAnalysis.service.ts:321-338`) **already writes verified
amount/currency/date/category back onto the draft expense.** A draft can be
created without those fields; they are populated at confirm. The minimal-creation
flow therefore needs no new write-back logic — only relaxed creation validation
plus a description backfill.

## New flow & screens

### Screen A — Create (rebuilt `SubmitExpensePage`)

Top to bottom:

1. **Receipt dropzone** (hero, primary): multi-select + drag-and-drop, file list
   with image thumbnails / PDF icons, per-file remove, per-file upload progress.
   Empty-state CTA = **"Upload Receipt"**. Helper text: formats (JPG/PNG/WEBP/PDF),
   5 MB each, up to 5 files.
2. **Where does this belong?** — Scope (Project / General) + Project select.
   *Required, marked with `*` and helper text.*
3. **Description** — **hidden by default.** Auto-derived from vendor on confirm.
   (Shown only in the manual fallback and editable in verify.)
4. Quiet **"No receipt? Enter manually"** link → reveals legacy
   amount/date/category/description fields for a `CASH`/no-document expense.
5. Sticky footer: primary CTA label transitions **"Upload Receipt" → "Analyze
   Receipt"** once ≥1 file is staged and a project is chosen. Secondary: "Save
   Draft", "Cancel".

Gating: "Analyze Receipt" enabled when (≥1 file staged) AND (scope=GENERAL OR
project chosen). The manual path enables "Submit"/"Save Draft" under the legacy
rules (amount>0, date, category, description).

### Screen B — Analysis (`ExpenseVerificationPage`'s analysis route)

Existing analysis/polling screen, minor polish. Now runs Kimi over **all**
uploaded documents and routes to verify on completion.

### Screen C — Verify (restyled `ExpenseVerificationPage`)

- Left: receipt viewer becomes a **multi-document thumbnail strip** (backed by
  `GET /expenses/:id/documents`), click to enlarge each.
- Right: extracted vendor/amount/date/category/etc. with confidence framing
  (violet→emerald meter). Description field shown here, pre-filled from vendor if
  the user left it blank.
- **"Confirm & Submit"** writes values back (existing behavior) and submits.

### Required vs optional (final)

- **Required:** Project (or General) · ≥1 receipt · at submit: amount>0, date,
  category (enforced at the confirm/submit gate, not at creation).
- **Optional:** Description (auto-derived), and we intentionally do **not** add
  tags/notes (keeps the form minimal; none exist today).

## Backend changes

### Multi-file storage model — additive, backward-compatible

- Add `documentIds: string[]` to the expense document/type.
- **Keep `documentId`** as the primary pointer (first uploaded doc). Every
  existing read path (`GET /document`, `/document/file`, `ReceiptPreview`, HR
  workbench, details page) stays untouched.
- The `expenseDocuments` collection already stores `expenseId` per row, so
  listing all docs for an expense is a single query. **No data migration**: old
  expenses keep their single `documentId`; a missing `documentIds` is read as a
  one-element list derived from `documentId`.

### Endpoints

| Method | Path | Change |
|---|---|---|
| POST | `/expenses/:id/documents` | multer `.array("files", 5)` (was `.single("file")`; still accepts 1). Appends to `documentIds`; sets `documentId` if unset. |
| GET | `/expenses/:id/documents` | **New** — list all document metadata for an expense. |
| GET | `/expenses/:id/documents/:docId/file` | **New** — stream a specific document (verify strip needs per-doc URLs). |
| DELETE | `/expenses/:id/documents/:docId` | **New** — remove one document. |

Legacy `GET /expenses/:id/document` and `/document/file` (singular, primary doc)
are retained for backward compatibility.

### AI merge

- `analyzeExpense` loads **all** docs for the expense and threads
  `documentIds[]` through `claimForRun` / `runAnalysis` / `extract`
  (`ExtractionInput` gains `documentIds: string[]`; `documentId` kept for compat).
- Kimi call (`kimi-extractor.ts:77-92`): build **one image part per page-image**
  and send them all in a single user turn (the content array already supports
  this). Updated system prompt: *"You may receive multiple images/pages for one
  expense; reconcile them into a single result."* Returns one merged
  `ExtractionResult`.
- Analysis result shape: add `documentIds: string[]`; keep singular `documentId`.
- Claim idempotency key extends from `(expenseId, documentId)` to cover the doc
  set (hash of sorted `documentIds`), so adding/removing a doc triggers a fresh run.

### Multi-page PDF rendering

- `document-image.ts` currently rasterizes **page 1 only** (`pdfFirstPageToPng`).
- Extend to render up to **3 pages** per PDF into multiple JPEG data URIs. A
  helper `toKimiImageDataUris(documentId): Promise<string[]>` returns 1..N images
  (image files → 1; PDFs → up to 3). The extractor flattens all docs' images into
  the single Kimi call.
- **Bound:** total images per call ≤ (5 docs × 3 pages) = 15; we additionally cap
  the flattened total to keep payload/token cost sane (cap = 8 images, documented
  in code; excess pages dropped with a logged note — never silent).

### Creation validation (Zod)

- `createExpenseBody`: when the AI/upload path is used, `amount`, `category`,
  `expenseDate`, and `description` become **optional**. `type` defaults to
  `DOCUMENT` when documents are present, `CASH` for the manual path.
- The manual fallback path still sends all fields and validates as today.
- Submit/confirm path remains the hard gate: amount>0, date, category required
  before the expense leaves DRAFT.

### Description backfill

- On `updateAnalysis(confirm:true)`: if the expense description is blank, set it
  from `vendorName` (e.g. `"Expense at <vendor>"` or just `<vendor>`), alongside
  the existing amount/currency/date/category write-back.

## Frontend changes

- **`ReceiptDropzone`** (new reusable component): drag-and-drop + multi-select
  input, staged-file list with thumbnails (image) / PDF icon, per-file remove,
  client-side type/size validation (existing 5 MB; jpg/png/webp/pdf), per-file
  upload status. Emits the staged `File[]` to the page.
- **`SubmitExpensePage`** rebuilt to the Screen A layout; CTA state machine
  (Upload→Analyze); required `*` indicators + helper text + inline validation
  messages; hidden-description default; manual-entry disclosure.
- **`ExpenseVerificationPage`** restyled: multi-doc thumbnail strip
  (`GET /documents`), confidence framing, description field with vendor pre-fill.
- **`expenses-api.ts` / `expense.ts` types**: `uploadExpenseDocuments(id, files[])`,
  `listExpenseDocuments(id)`, `deleteExpenseDocument(id, docId)`; `documentIds` on
  the `Expense` type.
- Reuse `ReceiptViewer`/`ReceiptPreview` for per-doc enlargement.

## Visual modernization (indigo / violet, expense-scoped)

- Add scoped tokens/utility classes for the expense screens rather than changing
  the global `--primary` (which is shared app-wide). Approach: a small set of
  expense-screen CSS variables / Tailwind classes — indigo-600 for primary CTAs,
  violet-500 for AI/analysis moments ("Sparkles", confidence), emerald-500 for
  success. Surfaces stay neutral. Dark mode mirrored.
- Applied to: create dropzone + sticky footer, analysis progress, verify
  confidence meter and actions.
- Verify visually (per `/run` or screenshot) that surrounding screens are
  unaffected since theming is scoped.

## AI adoption metrics (extends existing analytics)

Existing `AiAnalyticsReport` (`reports.aggregate.ts`) already tracks status
breakdown, provider distribution, confidence bands, processing time, tokens.
Adoption metrics extend it **forward-only** (historical rows read null), honoring
the Reports module's forward-only gotcha:

- **Creation path:** stamp each expense with `creationMethod: "AI" | "MANUAL"`
  (forward-only field) so we can report AI-path adoption %.
- **Multi-file usage:** distribution of document count per expense (derived from
  `documentIds.length`).
- **AI-accepted vs edited:** compare the immutable `aiExtraction` snapshot against
  the confirmed expense values to compute an "edited before confirm" rate per
  field (amount/date/category). The snapshot already exists for this purpose.
- **Confirmation rate:** analyses confirmed (`confirmedAt` set) vs analyzed.

New types added to `reports.types.ts` (`AiAdoptionReport` or fields on
`AiAnalyticsReport`); aggregation added to `reports.aggregate.ts`; surfaced in the
existing Reports AI tab. RBAC unchanged.

## Schema / migration impact

- **No destructive migration.** `documentIds` and `creationMethod` are additive
  and forward-only. `documentId` retained. Old expenses read correctly (single-doc
  list derived; metrics null for pre-existing rows).
- Firestore indexes: a `documents` listing by `expenseId` may need a composite
  index if ordered — confirm during implementation and add to
  `firestore.indexes.json` if required (deploy per Reports-module gotcha).

## Testing

**Backend**
- Multi-file upload: 1 file (back-compat) and N files; cap enforcement at 5.
- `documentIds` backward-compat read for legacy single-`documentId` expenses.
- Multi-image Kimi request shape via the mock extractor (asserts N image parts).
- Multi-page PDF: PDF renders up to 3 pages; image flatten cap respected + logged.
- Relaxed `createExpenseBody` (AI path optional fields) + manual path unchanged.
- Confirm write-back with relaxed creation, including description backfill.
- Adoption aggregation: creation-method counts, edit-rate from snapshot, null for
  historical rows.

**Frontend**
- `ReceiptDropzone`: add/remove/validation, drag-and-drop, multi-select.
- CTA state transitions (Upload→Analyze), required-field gating.
- Manual fallback disclosure path.
- Verify multi-doc strip renders per-doc thumbnails.

## Scope guardrails

- HR/Admin review screens stay functionally unchanged (read `documentId` +
  analysis as today; gain a multi-doc strip only when multiple docs exist).
- No tags/notes feature added — form stays minimal.
- Theming scoped to expense screens; no global token changes.

## Known risks / open items

- **Firebase Storage billing blocker** (project `opsflow-cc01b`, billing
  disabled) means uploads fail against the Firebase storage backend; multi-file is
  developed/verified against the local-disk backend. This is pre-existing and not
  introduced here.
- Multi-image token cost grows with pages; mitigated by the 5-doc / 3-page / 8-image
  caps.
- Kimi merge quality across heterogeneous docs (receipt + email) is probabilistic;
  the verify step remains the human gate.
