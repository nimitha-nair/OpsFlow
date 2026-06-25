# Phase 3B — AI Expense Intelligence Foundation (Design)

> **Status:** Approved design — pending implementation plan
> **Date:** 2026-06-17
> **Related:** [AI_PIPELINE.md](../../AI_PIPELINE.md) · backend expense module · frontend employee expense flow

## 1. Objective

Add an AI expense-extraction pipeline: an employee uploads a receipt/invoice,
triggers analysis, the system extracts structured fields via **Kimi-K2.6 Vision
on NVIDIA Build**, and the employee verifies/corrects the values before submitting
the expense for HR approval.

The existing expense workflow (create → upload → submit → HR review → reimburse)
is **unchanged**; analysis slots in between upload and submit and is optional —
the employee can always fill the form manually.

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Pages | Two sequential employee routes: **Analysis Review** then **Expense Verification** |
| Confirm semantics | Confirm **writes verified values back** onto the DRAFT expense, then submits |
| Processing model | **Async**: `POST /analyze` returns immediately (`PENDING`/`PROCESSING`); in-process background job calls Kimi; client **polls** `GET /analysis` |
| Roles | **Employee-only** writes (owner); HR/ADMIN may **read** analysis for audit |
| Extractor | Real **Kimi** extractor behind an `ExpenseExtractor` interface; **mock** retained for `AI_PROVIDER=mock` / tests |
| PDF | **Rasterize first page** to PNG before sending (most receipts are one page) |
| WebP | Transcode webp→jpg before sending (Kimi accepts GIF/JPG/JPEG/PNG only) |
| Confidence | Integer **0–100**; `AI_CONFIDENCE_THRESHOLD` env (default 70) |
| Raw output | Full model response preserved in `expenseAnalysis.extractedData.rawOutput` |

## 3. Verified NVIDIA / Kimi facts (Requirement #4)

Confirmed against official docs (build.nvidia.com, NIM VLM API pages, NVCF docs):

- `moonshotai/kimi-k2.6` **is natively multimodal** (MoonViT vision encoder; text/image/video).
- Image input is **OpenAI-compatible**:
  `messages[].content[]` = `{type:"text",text}` + `{type:"image_url",image_url:{url:"data:image/jpeg;base64,<b64>"}}`.
- Supported image types: **GIF, JPG, JPEG, PNG** (not WebP).
- **PDF not accepted directly** — must rasterize to image(s); default max 5 images/prompt.
- Large inline images must use the **NVCF Asset-upload API**; we avoid that by
  downscaling/compressing so the base64 stays small.
- Auth: `Authorization: Bearer $NVIDIA_API_KEY`; base `https://integrate.api.nvidia.com/v1`.
- Strict JSON via `response_format:{type:"json_object"}` (vLLM/SGLang); `guided_json`/`nvext`
  not supported → we also defensively parse + Zod-validate the output.

## 4. Data model — `expenseAnalysis` collection (1:1 per expense)

```ts
// types/expenseAnalysis.types.ts
export const ANALYSIS_STATUSES = [
  "PENDING", "PROCESSING", "COMPLETED", "FAILED", "LOW_CONFIDENCE",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

interface ExpenseAnalysisDocument {        // Firestore (Timestamp)
  id: string;
  expenseId: string;                       // unique — one analysis per expense
  documentId: string;
  status: AnalysisStatus;
  modelVersion?: string;                   // e.g. "kimi-k2.6"
  vendorName?: string;
  amount?: number;
  transactionDate?: string;                // YYYY-MM-DD
  currency?: string;
  paymentMethod?: string;                  // UPI/CARD/CASH/NETBANKING/...
  category?: string;
  taxInformation?: string;
  confidenceScore?: number;                // 0–100
  extractedData?: Record<string, unknown>; // includes { rawOutput, parsed }
  failureReason?: string;                  // set on FAILED
  confirmedAt?: Timestamp;                 // set when employee confirms
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
// ExpenseAnalysis = same shape with timestamps as ISO strings.
```

`amount`, `currency`, `transactionDate`, `category` map back onto the Expense on
confirm. `vendorName`, `paymentMethod`, `taxInformation` live only in the analysis
record (no native Expense field); `vendorName` may seed `description` if blank.

**Category mapping:** Kimi returns a free-text category, but `Expense.category` is a
fixed enum (`EXPENSE_CATEGORIES`). The Verify page's category field is a constrained
**Select** over the enum, prefilled with the AI value only when it maps to a valid
enum member (case-insensitive match, e.g. "Software"→`SOFTWARE`, "Meals"→`FOOD`);
otherwise it's left unset for the employee to pick. Write-back applies `category`
only when it is a valid enum value, so confirm never produces an invalid Expense.

## 5. Backend — files created (deliverable #1)

| File | Purpose |
|---|---|
| `types/expenseAnalysis.types.ts` | statuses, Document + client interfaces |
| `validation/expenseAnalysis.schema.ts` | `updateAnalysisBody` (optional fields + `confirm?`); reuses `idParams` |
| `services/ai/expense-extractor.ts` | `ExpenseExtractor` interface, `ExtractionResult`, `getExtractor()` env factory (`AI_PROVIDER`) |
| `services/ai/mock-extractor.ts` | deterministic mock (derives stable fake data from `expenseId`) |
| `services/ai/kimi-extractor.ts` | **real** NVIDIA Build call (see §8) |
| `services/ai/document-image.ts` | local-file → Kimi-ready image: load via `resolveExpenseDocumentFile`, webp→jpg, PDF page-1 raster, downscale, base64 data URI |
| `services/expenseAnalysis.service.ts` | `analyzeExpense` (async worker), `getAnalysisByExpenseId`, `updateAnalysis` (write-back on confirm) |
| `controllers/expenseAnalysis.controller.ts` | `postAnalyze`, `getAnalysis`, `patchAnalysis` |
| `routes/expense.routes.ts` *(modified)* | 3 new routes |
| `package.json` *(modified)* | add `sharp` (image transcode/resize) + a PDF rasterizer (e.g. `pdf-to-img`) |

New env (in `.env`, not `.env.example`): `AI_PROVIDER`, `NVIDIA_API_KEY`,
`NVIDIA_BASE_URL`, `NVIDIA_MODEL`, `AI_CONFIDENCE_THRESHOLD`.

## 6. API design (deliverable #2)

All under the existing `/expenses` router, after the literal segments.

- **`POST /expenses/:id/analyze`** — `authorize(EMPLOYEE)`, owner-only.
  - No `documentId` → analysis `FAILED` (reason "No document to analyze").
    *(The UI hides the trigger in this case; this guards direct API calls.)*
  - Else upsert analysis `PENDING`, **return 202** with the record, and dispatch
    the background job (not awaited). If already `PROCESSING`, return the current
    record (idempotent). Re-POST on a terminal state = reprocess (resets to `PENDING`).
- **`GET /expenses/:id/analysis`** — `authorize(ADMIN, HR, EMPLOYEE)`; owner + HR +
  ADMIN may read (same `canView` rule as expenses). Returns the analysis or `null`.
- **`PATCH /expenses/:id/analysis`** — `authorize(EMPLOYEE)`, owner-only. Saves edited
  fields. With `confirm:true`: writes `amount/currency/expenseDate(=transactionDate)/
  category` back to the DRAFT expense via existing `updateExpense`, stamps `confirmedAt`,
  keeps status `COMPLETED`. Submit is the **existing** `POST /expenses/:id/submit`.

### Background job lifecycle
`PENDING → PROCESSING → (COMPLETED | LOW_CONFIDENCE | FAILED)`

1. set `PROCESSING`.
2. `document-image` resolves the local file → Kimi-ready base64 image.
3. `extractor.extract()` calls Kimi, returns `ExtractionResult` + raw output.
4. **Validate** parsed JSON with Zod (#7). Persist `extractedData.rawOutput` (#8).
5. Map status: parsed OK & `confidence ≥ THRESHOLD` → `COMPLETED`; parsed OK &
   `< THRESHOLD` → `LOW_CONFIDENCE`; model/network error or **malformed JSON** →
   `FAILED` + `failureReason` (#10). Bounded transient retries before `FAILED`.

## 7. Verification flow (deliverable #3) — frontend

Files created: `types/expenseAnalysis.ts`, `lib/expense-analysis-api.ts`,
`components/expenses/AnalysisStatusBadge.tsx`, `components/expenses/ReceiptPreview.tsx`,
`components/expenses/ConfidenceMeter.tsx`, `pages/expenses/AnalysisReviewPage.tsx`,
`pages/expenses/ExpenseVerificationPage.tsx`; modified `App.tsx` (two `ProtectedRoute(EMPLOYEE)`
routes) and `pages/expenses/ExpenseDetailsPage.tsx` (entry button).

Flow (employee, own DRAFT expense):
1. **Entry** — `ExpenseDetailsPage` shows **"Analyze Receipt"** only when
   `expense.documentId` exists (#9) → routes to `/employee/expenses/:id/analysis`.
2. **Analysis Review** (`/analysis`) — receipt preview + AI status panel. Triggers
   `POST /analyze`, then **polls** `GET /analysis`. Per-status UI (§9). On
   `COMPLETED`/`LOW_CONFIDENCE`, **"Verify & edit →"** → `/verify`.
3. **Expense Verification** (`/verify`) — receipt preview + **editable** fields
   (vendor, amount, transactionDate, currency, category, payment method, tax info),
   prefilled from analysis. **Confirm** → `PATCH …/analysis {confirm:true}`
   (write-back). **Submit for approval** → existing `submitExpense`.

## 8. Kimi integration points (deliverable #4)

The **only** code that knows about NVIDIA/Kimi is `services/ai/kimi-extractor.ts`
+ `services/ai/document-image.ts`, both behind `ExpenseExtractor`:

```ts
export interface ExtractionInput { expenseId: string; documentId: string; }
export interface ExtractionResult {
  vendorName: string | null; amount: number | null; transactionDate: string | null;
  currency: string | null; paymentMethod: string | null; category: string | null;
  taxInformation: string | null; confidenceScore: number; rawOutput: string;
}
export interface ExpenseExtractor { extract(i: ExtractionInput): Promise<ExtractionResult>; }
export function getExtractor(): ExpenseExtractor { /* mock | kimi by AI_PROVIDER */ }
```

`kimi-extractor` steps: resolve local file → `document-image` (transcode/raster/
downscale → base64 data URI) → POST `${NVIDIA_BASE_URL}/chat/completions` with
`Bearer $NVIDIA_API_KEY`, `model=$NVIDIA_MODEL`, the `image_url` content array, a
strict extraction prompt (return JSON only; fields per §4; `null` when unreadable),
and `response_format:{type:"json_object"}` → parse + Zod-validate → `ExtractionResult`.

Swapping providers later = implement/extend this one file; service, statuses, API,
and UI are untouched.

## 9. AI status handling (UI states)

| Status | UI |
|---|---|
| `PENDING` | "Queued for analysis" + spinner; keep polling |
| `PROCESSING` | "Reading your receipt…" + spinner; keep polling |
| `COMPLETED` | Extracted summary + confidence meter; "Verify & edit →" |
| `LOW_CONFIDENCE` | Amber "Please double-check — low confidence" + same actions; fields shown as hints |
| `FAILED` | Red `failureReason` + **Retry** (re-POST `/analyze`) + "Enter manually" |

Manual entry is always available regardless of AI outcome.

## 10. Security

- Live NVIDIA key + JWT secret were committed in `.env.example`; **scrubbed to
  placeholders**. `.env` is gitignored. **The NVIDIA key must be rotated** (owner action).
- NVIDIA key read from env only; never logged. Receipt files stay local/private;
  only structured AI output (and raw model JSON) is stored in `expenseAnalysis`.
- Analysis access is RBAC + ownership scoped (owner, HR, ADMIN read; owner writes).

## 11. Out of scope

No change to the existing expense workflow (#11). No NVCF asset-upload path (avoided
via downscaling). Multi-page PDF, duplicate detection, multi-currency normalization,
durable external queue — future enhancements.
