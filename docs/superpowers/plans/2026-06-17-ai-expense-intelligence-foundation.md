# AI Expense Intelligence Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an employee analyze an uploaded receipt with Kimi-K2.6 Vision (NVIDIA Build), review/correct the extracted fields, and submit the expense — with `expenseAnalysis` as the audit trail and the Expense as source of truth.

**Architecture:** New backend `expenseAnalysis` Firestore collection (1:1 per expense) with types/validation/service/controller/routes mirroring the existing expense module. A pluggable `ExpenseExtractor` interface has a deterministic `mock` and a real `kimi` implementation; an in-process async worker runs analysis after `POST /analyze` returns, and the client polls `GET /analysis`. Two new employee-only React pages (Analysis Review → Expense Verification) drive verification; confirming writes verified values back onto the DRAFT expense and then uses the existing submit flow.

**Tech Stack:** TypeScript, Express 5, firebase-admin (Firestore), Zod, `sharp` (image transcode/resize), `pdf-to-img` (PDF→PNG), Vitest (new on backend, existing on frontend); React 19, react-router 7, axios, Base UI + Tailwind.

## Global Constraints

- Documents are stored on **local disk** (`backend/uploads/expenses`), resolved via `resolveExpenseDocumentFile(documentId)` — NOT Firebase Storage.
- Extracted fields exactly: `vendorName, amount, transactionDate, currency, paymentMethod, category, taxInformation` (+ `confidenceScore`).
- Confidence is an **integer 0–100**; threshold from `AI_CONFIDENCE_THRESHOLD` env (default `70`). `confidence ≥ threshold` → `COMPLETED`, else `LOW_CONFIDENCE`.
- Kimi accepts **GIF/JPG/JPEG/PNG only** (transcode webp→jpg); **no PDF** (rasterize first page to PNG); downscale long edge to ≤ 1600px to keep inline base64 small.
- Image wire format: OpenAI-style `messages[].content[]` with `{type:"image_url", image_url:{url:"data:image/jpeg;base64,<b64>"}}`; auth `Authorization: Bearer $NVIDIA_API_KEY`; `response_format:{type:"json_object"}`; always defensively parse + Zod-validate model output.
- Validate all model output before writing to Firestore; malformed → status `FAILED` + `failureReason`; retry allowed by re-POSTing `/analyze`.
- Preserve verbatim model output in `expenseAnalysis.extractedData.rawOutput`.
- Roles: `POST /analyze` & `PATCH /analysis` = owning EMPLOYEE only; `GET /analysis` = owner + HR + ADMIN (reuse expense `canView`).
- Hide the "Analyze Receipt" button when the expense has no `documentId`.
- **Do not change the existing expense create/upload/submit/review/reimburse workflow.** Only add analysis on top and write verified values back via the existing `updateExpense`.
- Secrets: never read NVIDIA key except from `process.env`; never log it; never write it to `.env.example`.

**Backend test commands:** `npm run typecheck` (tsc) and `npm test` (vitest, added in Task 1).
**Frontend test commands:** `npm test` (vitest) and `npm run build` (tsc -b + vite build).

---

## Task 1: Backend deps, AI config, and Vitest harness

**Files:**
- Modify: `backend/package.json` (deps + `test` script)
- Create: `backend/vitest.config.ts`
- Create: `backend/src/config/ai.ts`
- Test: `backend/src/config/ai.test.ts`

**Interfaces:**
- Produces: `getAiConfig(): AiConfig` where
  `AiConfig = { provider: "mock"|"kimi"; nvidiaApiKey: string; nvidiaBaseUrl: string; nvidiaModel: string; confidenceThreshold: number }`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd backend
npm install sharp pdf-to-img
npm install -D vitest
```
Expected: packages added; `package.json` updated.

- [ ] **Step 2: Add the test script**

In `backend/package.json`, replace the `test` script line:
```json
"test": "vitest run",
```

- [ ] **Step 3: Create `backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test** — `backend/src/config/ai.test.ts`

```ts
import { afterEach, describe, expect, it } from "vitest";
import { getAiConfig } from "./ai";

const KEYS = [
  "AI_PROVIDER", "NVIDIA_API_KEY", "NVIDIA_BASE_URL",
  "NVIDIA_MODEL", "AI_CONFIDENCE_THRESHOLD",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("getAiConfig", () => {
  it("defaults to the mock provider and documented values", () => {
    const cfg = getAiConfig();
    expect(cfg.provider).toBe("mock");
    expect(cfg.nvidiaBaseUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(cfg.nvidiaModel).toBe("moonshotai/kimi-k2.6");
    expect(cfg.confidenceThreshold).toBe(70);
  });

  it("reads kimi provider and overrides from env", () => {
    process.env.AI_PROVIDER = "kimi";
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.AI_CONFIDENCE_THRESHOLD = "85";
    const cfg = getAiConfig();
    expect(cfg.provider).toBe("kimi");
    expect(cfg.nvidiaApiKey).toBe("nvapi-test");
    expect(cfg.confidenceThreshold).toBe(85);
  });

  it("falls back to mock for an unknown provider", () => {
    process.env.AI_PROVIDER = "openai";
    expect(getAiConfig().provider).toBe("mock");
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./ai`.

- [ ] **Step 6: Implement `backend/src/config/ai.ts`**

```ts
export interface AiConfig {
  provider: "mock" | "kimi";
  nvidiaApiKey: string;
  nvidiaBaseUrl: string;
  nvidiaModel: string;
  /** Integer 0–100; results with confidence below this are LOW_CONFIDENCE. */
  confidenceThreshold: number;
}

/** Read AI extractor config from the environment (dotenv-loaded). */
export function getAiConfig(): AiConfig {
  const provider = process.env.AI_PROVIDER === "kimi" ? "kimi" : "mock";
  const threshold = Number.parseInt(
    process.env.AI_CONFIDENCE_THRESHOLD ?? "70",
    10,
  );
  return {
    provider,
    nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
    nvidiaBaseUrl:
      process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    nvidiaModel: process.env.NVIDIA_MODEL ?? "moonshotai/kimi-k2.6",
    confidenceThreshold: Number.isFinite(threshold) ? threshold : 70,
  };
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm test` → Expected: PASS (3 tests).
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/vitest.config.ts backend/src/config/ai.ts backend/src/config/ai.test.ts
git commit -m "feat(ai): add AI config + vitest harness for expense analysis"
```

---

## Task 2: expenseAnalysis types

**Files:**
- Create: `backend/src/types/expenseAnalysis.types.ts`

**Interfaces:**
- Produces: `ANALYSIS_STATUSES`, `AnalysisStatus`, `ExpenseAnalysisDocument` (Firestore, `Timestamp`), `ExpenseAnalysis` (client, ISO strings).

- [ ] **Step 1: Create the types file**

```ts
import type { Timestamp } from "firebase-admin/firestore";

export const ANALYSIS_STATUSES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "LOW_CONFIDENCE",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** Internal analysis record as stored in Firestore (`expenseAnalysis`). */
export interface ExpenseAnalysisDocument {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string; // YYYY-MM-DD
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confidenceScore?: number; // 0–100
  /** Includes { rawOutput, parsed } from the model. */
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Client-facing analysis; timestamps serialized as ISO-8601 strings. */
export interface ExpenseAnalysis {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confidenceScore?: number;
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/expenseAnalysis.types.ts
git commit -m "feat(ai): add expenseAnalysis types"
```

---

## Task 3: Extraction parsing, validation, status & category mapping (pure logic, TDD)

**Files:**
- Create: `backend/src/services/ai/extraction.ts`
- Test: `backend/src/services/ai/extraction.test.ts`
- Create: `backend/src/services/ai/category-map.ts`
- Test: `backend/src/services/ai/category-map.test.ts`

**Interfaces:**
- Produces:
  - `ExtractionResult` (the canonical extractor output) and `ExtractionInput`.
  - `parseModelJson(raw: string): ExtractionResult` — throws `MalformedExtractionError` on bad input.
  - `class MalformedExtractionError extends Error`.
  - `statusForConfidence(score: number, threshold: number): "COMPLETED" | "LOW_CONFIDENCE"`.
  - `mapToExpenseCategory(raw: string | null | undefined): ExpenseCategory | undefined`.
- Consumes: `EXPENSE_CATEGORIES`, `ExpenseCategory` from `../../types/expense.types`.

- [ ] **Step 1: Write the failing test for extraction** — `backend/src/services/ai/extraction.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  MalformedExtractionError,
  parseModelJson,
  statusForConfidence,
} from "./extraction";

const good = JSON.stringify({
  vendorName: "Uber",
  amount: 450.5,
  transactionDate: "2026-06-15",
  currency: "INR",
  paymentMethod: "CARD",
  category: "Travel",
  taxInformation: "GST 18%",
  confidenceScore: 92,
});

describe("parseModelJson", () => {
  it("parses a clean JSON object", () => {
    const r = parseModelJson(good);
    expect(r.vendorName).toBe("Uber");
    expect(r.amount).toBe(450.5);
    expect(r.confidenceScore).toBe(92);
    expect(r.rawOutput).toBe(good);
  });

  it("strips ```json fences and extracts the object", () => {
    const r = parseModelJson("```json\n" + good + "\n```");
    expect(r.vendorName).toBe("Uber");
  });

  it("coerces missing fields to null and clamps confidence", () => {
    const r = parseModelJson(JSON.stringify({ vendorName: "X", confidenceScore: 240 }));
    expect(r.amount).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.confidenceScore).toBe(100);
  });

  it("throws MalformedExtractionError on non-JSON", () => {
    expect(() => parseModelJson("sorry, I cannot read this")).toThrow(
      MalformedExtractionError,
    );
  });

  it("throws MalformedExtractionError when amount is not a number", () => {
    expect(() =>
      parseModelJson(JSON.stringify({ amount: "free", confidenceScore: 50 })),
    ).toThrow(MalformedExtractionError);
  });
});

describe("statusForConfidence", () => {
  it("returns COMPLETED at or above threshold", () => {
    expect(statusForConfidence(70, 70)).toBe("COMPLETED");
    expect(statusForConfidence(95, 70)).toBe("COMPLETED");
  });
  it("returns LOW_CONFIDENCE below threshold", () => {
    expect(statusForConfidence(69, 70)).toBe("LOW_CONFIDENCE");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- extraction`
Expected: FAIL — cannot resolve `./extraction`.

- [ ] **Step 3: Implement `backend/src/services/ai/extraction.ts`**

```ts
import { z } from "zod";

/** Canonical, provider-agnostic extractor output. */
export interface ExtractionResult {
  vendorName: string | null;
  amount: number | null;
  transactionDate: string | null; // YYYY-MM-DD
  currency: string | null;
  paymentMethod: string | null;
  category: string | null; // free text from the model
  taxInformation: string | null;
  confidenceScore: number; // 0–100
  rawOutput: string; // verbatim model content
}

export interface ExtractionInput {
  expenseId: string;
  documentId: string;
}

/** Thrown when the model output cannot be parsed/validated into a result. */
export class MalformedExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExtractionError";
  }
}

const nullableString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? null : v));

const modelJsonSchema = z.object({
  vendorName: nullableString,
  amount: z
    .union([z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? null : v)),
  transactionDate: nullableString,
  currency: nullableString,
  paymentMethod: nullableString,
  category: nullableString,
  taxInformation: nullableString,
  confidenceScore: z
    .union([z.number(), z.null()])
    .optional()
    .transform((v) => (v == null ? 0 : v)),
});

/** Pull the first balanced JSON object out of a possibly-fenced string. */
function extractJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new MalformedExtractionError("No JSON object found in model output");
  }
  return raw.slice(start, end + 1);
}

/** Parse + validate raw model text into an ExtractionResult. */
export function parseModelJson(raw: string): ExtractionResult {
  const slice = extractJsonObject(raw);
  let json: unknown;
  try {
    json = JSON.parse(slice);
  } catch {
    throw new MalformedExtractionError("Model output is not valid JSON");
  }
  const parsed = modelJsonSchema.safeParse(json);
  if (!parsed.success) {
    throw new MalformedExtractionError(
      `Model output failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  const d = parsed.data;
  const confidence = Math.max(0, Math.min(100, Math.round(d.confidenceScore)));
  return {
    vendorName: d.vendorName,
    amount: d.amount,
    transactionDate: d.transactionDate,
    currency: d.currency,
    paymentMethod: d.paymentMethod,
    category: d.category,
    taxInformation: d.taxInformation,
    confidenceScore: confidence,
    rawOutput: raw,
  };
}

/** Map a confidence score to a terminal success status. */
export function statusForConfidence(
  score: number,
  threshold: number,
): "COMPLETED" | "LOW_CONFIDENCE" {
  return score >= threshold ? "COMPLETED" : "LOW_CONFIDENCE";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- extraction`
Expected: PASS.

- [ ] **Step 5: Write the failing test for category mapping** — `backend/src/services/ai/category-map.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mapToExpenseCategory } from "./category-map";

describe("mapToExpenseCategory", () => {
  it("maps exact enum names case-insensitively", () => {
    expect(mapToExpenseCategory("TRAVEL")).toBe("TRAVEL");
    expect(mapToExpenseCategory("travel")).toBe("TRAVEL");
  });
  it("maps common synonyms", () => {
    expect(mapToExpenseCategory("Meals")).toBe("FOOD");
    expect(mapToExpenseCategory("Restaurant")).toBe("FOOD");
    expect(mapToExpenseCategory("Software subscription")).toBe("SOFTWARE");
    expect(mapToExpenseCategory("Cloud")).toBe("CLOUD_SERVICES");
  });
  it("returns undefined for unknown / empty", () => {
    expect(mapToExpenseCategory("Spaceship")).toBeUndefined();
    expect(mapToExpenseCategory(null)).toBeUndefined();
    expect(mapToExpenseCategory(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm test -- category-map`
Expected: FAIL — cannot resolve `./category-map`.

- [ ] **Step 7: Implement `backend/src/services/ai/category-map.ts`**

```ts
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "../../types/expense.types";

/** Substring → canonical category. First match wins; order matters. */
const SYNONYMS: ReadonlyArray<[string, ExpenseCategory]> = [
  ["cloud", "CLOUD_SERVICES"],
  ["aws", "CLOUD_SERVICES"],
  ["azure", "CLOUD_SERVICES"],
  ["software", "SOFTWARE"],
  ["subscription", "SOFTWARE"],
  ["saas", "SOFTWARE"],
  ["hardware", "HARDWARE"],
  ["laptop", "HARDWARE"],
  ["device", "HARDWARE"],
  ["travel", "TRAVEL"],
  ["taxi", "TRAVEL"],
  ["uber", "TRAVEL"],
  ["flight", "TRAVEL"],
  ["hotel", "TRAVEL"],
  ["food", "FOOD"],
  ["meal", "FOOD"],
  ["restaurant", "FOOD"],
  ["training", "TRAINING"],
  ["course", "TRAINING"],
  ["office", "OFFICE_SUPPLIES"],
  ["stationery", "OFFICE_SUPPLIES"],
  ["supplies", "OFFICE_SUPPLIES"],
];

/** Map free-text model category to a valid ExpenseCategory, or undefined. */
export function mapToExpenseCategory(
  raw: string | null | undefined,
): ExpenseCategory | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(norm)) {
    return norm as ExpenseCategory;
  }
  const lower = raw.toLowerCase();
  for (const [needle, cat] of SYNONYMS) {
    if (lower.includes(needle)) return cat;
  }
  return undefined;
}
```

- [ ] **Step 8: Run to verify it passes + typecheck**

Run: `npm test -- category-map` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/ai/extraction.ts backend/src/services/ai/extraction.test.ts backend/src/services/ai/category-map.ts backend/src/services/ai/category-map.test.ts
git commit -m "feat(ai): add extraction parsing, validation, status & category mapping"
```

---

## Task 4: ExpenseExtractor interface + deterministic mock (TDD)

**Files:**
- Create: `backend/src/services/ai/expense-extractor.ts`
- Create: `backend/src/services/ai/mock-extractor.ts`
- Test: `backend/src/services/ai/mock-extractor.test.ts`

**Interfaces:**
- Produces:
  - `interface ExpenseExtractor { extract(input: ExtractionInput): Promise<ExtractionResult> }`.
  - `mockExtractor: ExpenseExtractor`.
  - `getExtractor(): ExpenseExtractor` (returns `kimiExtractor` when `AI_PROVIDER=kimi`, else `mockExtractor`).
- Consumes: `ExtractionInput`, `ExtractionResult` (Task 3); `kimiExtractor` (Task 6) — wired in Task 6.

- [ ] **Step 1: Write the failing test** — `backend/src/services/ai/mock-extractor.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { mockExtractor } from "./mock-extractor";

describe("mockExtractor", () => {
  it("returns a complete, well-formed result", async () => {
    const r = await mockExtractor.extract({ expenseId: "abc123", documentId: "d1" });
    expect(typeof r.vendorName).toBe("string");
    expect(typeof r.amount).toBe("number");
    expect(r.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(r.confidenceScore).toBeLessThanOrEqual(100);
    expect(r.rawOutput.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same expenseId", async () => {
    const a = await mockExtractor.extract({ expenseId: "same", documentId: "d1" });
    const b = await mockExtractor.extract({ expenseId: "same", documentId: "d2" });
    expect(a).toEqual(b);
  });

  it("varies confidence by expenseId so both COMPLETED and LOW_CONFIDENCE occur", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const scores = await Promise.all(
      ids.map((id) => mockExtractor.extract({ expenseId: id, documentId: "d" })),
    );
    const values = scores.map((s) => s.confidenceScore);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(70);
    expect(Math.min(...values)).toBeLessThan(70);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- mock-extractor`
Expected: FAIL — cannot resolve `./mock-extractor`.

- [ ] **Step 3: Implement `backend/src/services/ai/mock-extractor.ts`**

```ts
import type { ExpenseExtractor } from "./expense-extractor";
import type { ExtractionInput, ExtractionResult } from "./extraction";

const VENDORS = ["Uber", "Amazon", "Starbucks", "AWS", "Office Depot"];
const CATEGORIES = ["Travel", "Software", "Food", "Cloud", "Office"];
const METHODS = ["UPI", "CARD", "CASH", "NETBANKING"];

/** Small stable hash so mock output is deterministic per expenseId. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministic mock extractor — ignores the actual document and derives stable
 * fake data from the expenseId. Confidence spans 55–99 so both COMPLETED and
 * LOW_CONFIDENCE states are reachable for demo/testing.
 */
export const mockExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const h = hash(input.expenseId);
    const amount = 100 + (h % 9900) / 10; // 100.0 – 1090.0
    const day = (h % 28) + 1;
    const transactionDate = `2026-06-${String(day).padStart(2, "0")}`;
    const confidenceScore = 55 + (h % 45); // 55 – 99
    const result = {
      vendorName: VENDORS[h % VENDORS.length],
      amount: Math.round(amount * 100) / 100,
      transactionDate,
      currency: "INR",
      paymentMethod: METHODS[h % METHODS.length],
      category: CATEGORIES[h % CATEGORIES.length],
      taxInformation: h % 2 === 0 ? "GST 18%" : null,
      confidenceScore,
    };
    return { ...result, rawOutput: JSON.stringify(result) };
  },
};
```

- [ ] **Step 4: Implement `backend/src/services/ai/expense-extractor.ts`**

```ts
import { getAiConfig } from "../../config/ai";
import type { ExtractionInput, ExtractionResult } from "./extraction";
import { mockExtractor } from "./mock-extractor";
import { kimiExtractor } from "./kimi-extractor";

export type { ExtractionInput, ExtractionResult } from "./extraction";

/** Provider-agnostic receipt extractor. The only seam Kimi plugs into. */
export interface ExpenseExtractor {
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** Pick the extractor implementation from AI_PROVIDER (default: mock). */
export function getExtractor(): ExpenseExtractor {
  return getAiConfig().provider === "kimi" ? kimiExtractor : mockExtractor;
}
```

> Note: this imports `kimiExtractor` (Task 6). If implementing strictly in order, temporarily comment the kimi import + branch and restore them in Task 6; the test in Step 5 only touches `mockExtractor`.

- [ ] **Step 5: Run mock tests + typecheck**

Run: `npm test -- mock-extractor` → Expected: PASS.
Run: `npm run typecheck` → Expected: no errors (after Task 6, or with kimi import temporarily stubbed).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/expense-extractor.ts backend/src/services/ai/mock-extractor.ts backend/src/services/ai/mock-extractor.test.ts
git commit -m "feat(ai): add ExpenseExtractor interface + deterministic mock"
```

---

## Task 5: Document→image helper (sharp transcode/resize + PDF raster)

**Files:**
- Create: `backend/src/services/ai/document-image.ts`
- Test: `backend/src/services/ai/document-image.test.ts`

**Interfaces:**
- Produces: `toKimiImageDataUri(documentId: string): Promise<string>` (returns `data:image/...;base64,<b64>`); `isPdf(mimeType: string): boolean`.
- Consumes: `resolveExpenseDocumentFile` from `../expense-document.service`.

- [ ] **Step 1: Write the failing test for the pure helper** — `backend/src/services/ai/document-image.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { isPdf } from "./document-image";

describe("isPdf", () => {
  it("detects PDF mime types", () => {
    expect(isPdf("application/pdf")).toBe(true);
  });
  it("is false for images", () => {
    expect(isPdf("image/png")).toBe(false);
    expect(isPdf("image/webp")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- document-image`
Expected: FAIL — cannot resolve `./document-image`.

- [ ] **Step 3: Implement `backend/src/services/ai/document-image.ts`**

```ts
import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { resolveExpenseDocumentFile } from "../expense-document.service";

/** Long-edge cap so the inline base64 stays well under NVIDIA's size limit. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 80;

export function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

/** Render page 1 of a PDF (from disk) to a PNG buffer via pdf-to-img. */
async function pdfFirstPageToPng(absolutePath: string): Promise<Buffer> {
  // pdf-to-img is ESM-only; dynamic import keeps this CommonJS-friendly.
  const { pdf } = await import("pdf-to-img");
  const doc = await pdf(absolutePath, { scale: 2 });
  for await (const page of doc) {
    return page; // first page only
  }
  throw new Error("PDF has no pages to render");
}

/**
 * Resolve a stored document to a Kimi-ready JPEG data URI:
 * - PDF → rasterize page 1 to PNG, then to JPEG
 * - image (incl. webp) → transcode to JPEG
 * Both are downscaled to <= MAX_EDGE on the long side.
 */
export async function toKimiImageDataUri(documentId: string): Promise<string> {
  const file = await resolveExpenseDocumentFile(documentId);

  const sourceBuffer = isPdf(file.mimeType)
    ? await pdfFirstPageToPng(file.absolutePath)
    : await readFile(file.absolutePath);

  const jpeg = await sharp(sourceBuffer)
    .rotate() // honor EXIF orientation
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
```

- [ ] **Step 4: Run the pure test + typecheck**

Run: `npm test -- document-image` → Expected: PASS (`isPdf`).
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 5: Manual conversion check (no real API)**

Create a throwaway script or `node -e` after `npm run build` is not required; instead verify `sharp` loads and transcodes a sample:
```bash
node -e "const sharp=require('sharp'); sharp({create:{width:10,height:10,channels:3,background:'#fff'}}).jpeg().toBuffer().then(b=>console.log('sharp ok', b.length>0))"
```
Expected: prints `sharp ok true`. (PDF rasterization is exercised end-to-end during Task 7 manual run.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/document-image.ts backend/src/services/ai/document-image.test.ts
git commit -m "feat(ai): add document->image helper (transcode/resize + pdf raster)"
```

---

## Task 6: Real Kimi extractor (NVIDIA Build)

**Files:**
- Create: `backend/src/services/ai/kimi-extractor.ts`
- Test: `backend/src/services/ai/kimi-extractor.test.ts`

**Interfaces:**
- Produces: `kimiExtractor: ExpenseExtractor`.
- Consumes: `getAiConfig`, `toKimiImageDataUri`, `parseModelJson`, `ExtractionInput`, `ExtractionResult`.

- [ ] **Step 1: Write the failing test (mocked fetch + mocked image)** — `backend/src/services/ai/kimi-extractor.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./document-image", () => ({
  toKimiImageDataUri: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

import { kimiExtractor } from "./kimi-extractor";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.NVIDIA_API_KEY;
});

function mockFetchOnceWithContent(content: string) {
  const json = { choices: [{ message: { content } }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => json }) as unknown as Response),
  );
}

describe("kimiExtractor", () => {
  it("sends an image_url message and parses JSON content", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    mockFetchOnceWithContent(
      JSON.stringify({ vendorName: "Uber", amount: 450, confidenceScore: 90 }),
    );
    const r = await kimiExtractor.extract({ expenseId: "e1", documentId: "d1" });
    expect(r.vendorName).toBe("Uber");
    expect(r.amount).toBe(450);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("moonshotai/kimi-k2.6");
    expect(body.messages[0].content).toContainEqual(
      expect.objectContaining({ type: "image_url" }),
    );
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer nvapi-test",
    });
  });

  it("throws when NVIDIA returns a non-OK status", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as unknown as Response),
    );
    await expect(
      kimiExtractor.extract({ expenseId: "e1", documentId: "d1" }),
    ).rejects.toThrow();
  });

  it("throws when no API key is configured", async () => {
    await expect(
      kimiExtractor.extract({ expenseId: "e1", documentId: "d1" }),
    ).rejects.toThrow(/NVIDIA_API_KEY/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- kimi-extractor`
Expected: FAIL — cannot resolve `./kimi-extractor`.

- [ ] **Step 3: Implement `backend/src/services/ai/kimi-extractor.ts`**

```ts
import { getAiConfig } from "../../config/ai";
import type { ExpenseExtractor } from "./expense-extractor";
import { toKimiImageDataUri } from "./document-image";
import {
  parseModelJson,
  type ExtractionInput,
  type ExtractionResult,
} from "./extraction";

const SYSTEM_PROMPT =
  "You are an expense-receipt extraction engine. Read the receipt/invoice image " +
  "and return ONLY a strict JSON object — no prose, no markdown fences. Use this " +
  "exact shape, with null for any field you cannot read:\n" +
  `{"vendorName": string|null, "amount": number|null, "transactionDate": "YYYY-MM-DD"|null, ` +
  `"currency": string|null, "paymentMethod": string|null, "category": string|null, ` +
  `"taxInformation": string|null, "confidenceScore": number}\n` +
  "amount is the numeric total with no currency symbol. confidenceScore is an " +
  "integer 0-100 reflecting overall extraction certainty.";

/** Real extractor: NVIDIA Build / Kimi-K2.6 Vision. */
export const kimiExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const cfg = getAiConfig();
    if (!cfg.nvidiaApiKey) {
      throw new Error("NVIDIA_API_KEY is not configured");
    }

    const dataUri = await toKimiImageDataUri(input.documentId);

    const res = await fetch(`${cfg.nvidiaBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${cfg.nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: cfg.nvidiaModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the expense data from this receipt." },
              { type: "image_url", image_url: { url: dataUri } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`NVIDIA Build error ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("NVIDIA Build returned no message content");
    }
    return parseModelJson(content); // throws MalformedExtractionError on bad JSON
  },
};
```

- [ ] **Step 4: Restore the kimi wiring in `expense-extractor.ts`**

Ensure `expense-extractor.ts` imports and branches to `kimiExtractor` (un-comment if stubbed in Task 4).

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- kimi-extractor` → Expected: PASS.
Run: `npm test` → Expected: all suites PASS.
Run: `npm run typecheck` → Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ai/kimi-extractor.ts backend/src/services/ai/kimi-extractor.test.ts backend/src/services/ai/expense-extractor.ts
git commit -m "feat(ai): add real Kimi-K2.6 extractor (NVIDIA Build)"
```

---

## Task 7: expenseAnalysis service (Firestore CRUD + async worker + write-back)

**Files:**
- Create: `backend/src/services/expenseAnalysis.service.ts`

**Interfaces:**
- Produces:
  - `getAnalysisByExpenseId(expenseId: string): Promise<ExpenseAnalysis | null>`.
  - `analyzeExpense(expenseId: string, ownerId: string): Promise<ExpenseAnalysis>`.
  - `updateAnalysis(expenseId: string, ownerId: string, patch: UpdateAnalysisInput): Promise<ExpenseAnalysis>`.
  - `interface UpdateAnalysisInput { vendorName?; amount?; transactionDate?; currency?; paymentMethod?; category?; taxInformation?; confirm?: boolean }`.
- Consumes: `requireExpense`, `updateExpense` from `./expense.service`; `getExtractor` (Task 4); `toKimiImageDataUri` indirectly via extractor; `parseModelJson`/`statusForConfidence`/`MalformedExtractionError` (Task 3); `mapToExpenseCategory` (Task 3); `getAiConfig` (Task 1).

> Firestore I/O is not unit-tested (no existing mock harness, matching the codebase). Verification is `typecheck` + the manual run in Step 3.

- [ ] **Step 1: Implement `backend/src/services/expenseAnalysis.service.ts`**

```ts
import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { getAiConfig } from "../config/ai";
import { ApiError } from "../utils/errors";
import { requireExpense, updateExpense } from "./expense.service";
import { getExtractor } from "./ai/expense-extractor";
import {
  MalformedExtractionError,
  statusForConfidence,
} from "./ai/extraction";
import { mapToExpenseCategory } from "./ai/category-map";
import type {
  AnalysisStatus,
  ExpenseAnalysis,
  ExpenseAnalysisDocument,
} from "../types/expenseAnalysis.types";

const ANALYSIS_COLLECTION = "expenseAnalysis";
const MAX_RETRIES = 2;

export interface UpdateAnalysisInput {
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confirm?: boolean;
}

function tsIso(value?: Timestamp): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

function toView(doc: ExpenseAnalysisDocument): ExpenseAnalysis {
  return {
    ...doc,
    confirmedAt: tsIso(doc.confirmedAt),
    createdAt: tsIso(doc.createdAt) ?? new Date(0).toISOString(),
    updatedAt: tsIso(doc.updatedAt) ?? new Date(0).toISOString(),
  };
}

async function findDocByExpenseId(
  expenseId: string,
): Promise<ExpenseAnalysisDocument | null> {
  const snap = await db
    .collection(ANALYSIS_COLLECTION)
    .where("expenseId", "==", expenseId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<ExpenseAnalysisDocument, "id">) };
}

async function loadDocById(id: string): Promise<ExpenseAnalysisDocument | null> {
  const snap = await db.collection(ANALYSIS_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ExpenseAnalysisDocument, "id">) };
}

/** Public read. */
export async function getAnalysisByExpenseId(
  expenseId: string,
): Promise<ExpenseAnalysis | null> {
  const doc = await findDocByExpenseId(expenseId);
  return doc ? toView(doc) : null;
}

/** Create or reset the analysis row to PENDING, returning the row id. */
async function upsertPending(
  expenseId: string,
  documentId: string,
): Promise<string> {
  const existing = await findDocByExpenseId(expenseId);
  const base = {
    expenseId,
    documentId,
    status: "PENDING" as AnalysisStatus,
    failureReason: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (existing) {
    await db.collection(ANALYSIS_COLLECTION).doc(existing.id).update(base);
    return existing.id;
  }
  const ref = await db.collection(ANALYSIS_COLLECTION).add({
    ...base,
    failureReason: undefined,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

async function setFailed(id: string, reason: string): Promise<void> {
  await db.collection(ANALYSIS_COLLECTION).doc(id).update({
    status: "FAILED" as AnalysisStatus,
    failureReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Background worker: extract, validate, persist terminal status. */
async function runAnalysis(
  id: string,
  expenseId: string,
  documentId: string,
): Promise<void> {
  await db.collection(ANALYSIS_COLLECTION).doc(id).update({
    status: "PROCESSING" as AnalysisStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const cfg = getAiConfig();
  const extractor = getExtractor();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const r = await extractor.extract({ expenseId, documentId });
      const status = statusForConfidence(r.confidenceScore, cfg.confidenceThreshold);
      await db.collection(ANALYSIS_COLLECTION).doc(id).update({
        status,
        modelVersion: cfg.nvidiaModel,
        vendorName: r.vendorName ?? FieldValue.delete(),
        amount: r.amount ?? FieldValue.delete(),
        transactionDate: r.transactionDate ?? FieldValue.delete(),
        currency: r.currency ?? FieldValue.delete(),
        paymentMethod: r.paymentMethod ?? FieldValue.delete(),
        category: r.category ?? FieldValue.delete(),
        taxInformation: r.taxInformation ?? FieldValue.delete(),
        confidenceScore: r.confidenceScore,
        extractedData: { rawOutput: r.rawOutput },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    } catch (err) {
      // Malformed model output is terminal — do not retry.
      if (err instanceof MalformedExtractionError) {
        await setFailed(id, err.message);
        return;
      }
      // Transient (network/API) — retry, then fail.
      if (attempt === MAX_RETRIES) {
        const reason = err instanceof Error ? err.message : "Analysis failed";
        await setFailed(id, reason);
        return;
      }
    }
  }
}

/**
 * Trigger analysis for an expense's document. Returns immediately with the row
 * in PENDING/PROCESSING (or FAILED if there is no document); the extraction runs
 * in the background and the client polls getAnalysisByExpenseId.
 */
export async function analyzeExpense(
  expenseId: string,
  ownerId: string,
): Promise<ExpenseAnalysis> {
  const expense = await requireExpense(expenseId);
  if (expense.employeeId !== ownerId) {
    throw new ApiError(403, "You can only analyze your own expenses");
  }

  // Already running — return current state (idempotent).
  const existing = await findDocByExpenseId(expenseId);
  if (existing && existing.status === "PROCESSING") {
    return toView(existing);
  }

  if (!expense.documentId) {
    const id = await upsertPending(expenseId, "");
    await setFailed(id, "No document to analyze");
    const failed = await loadDocById(id);
    return toView(failed!);
  }

  const id = await upsertPending(expenseId, expense.documentId);
  // Fire-and-forget background job (long-running Node process per AI_PIPELINE.md).
  void runAnalysis(id, expenseId, expense.documentId);

  const pending = await loadDocById(id);
  return toView(pending!);
}

/**
 * Save employee edits to the analysis. With confirm=true, write the verified
 * values back onto the DRAFT expense (source of truth) and stamp confirmedAt.
 */
export async function updateAnalysis(
  expenseId: string,
  ownerId: string,
  patch: UpdateAnalysisInput,
): Promise<ExpenseAnalysis> {
  const expense = await requireExpense(expenseId);
  if (expense.employeeId !== ownerId) {
    throw new ApiError(403, "You can only edit your own analysis");
  }
  const doc = await findDocByExpenseId(expenseId);
  if (!doc) {
    throw new ApiError(404, "No analysis found for this expense");
  }

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (patch.vendorName !== undefined) updates.vendorName = patch.vendorName;
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.transactionDate !== undefined) updates.transactionDate = patch.transactionDate;
  if (patch.currency !== undefined) updates.currency = patch.currency;
  if (patch.paymentMethod !== undefined) updates.paymentMethod = patch.paymentMethod;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.taxInformation !== undefined) updates.taxInformation = patch.taxInformation;

  if (patch.confirm) {
    updates.confirmedAt = FieldValue.serverTimestamp();
    // Write verified values back onto the DRAFT expense (source of truth).
    const writeBack: Record<string, unknown> = {};
    const amount = patch.amount ?? doc.amount;
    const currency = patch.currency ?? doc.currency;
    const date = patch.transactionDate ?? doc.transactionDate;
    const category = mapToExpenseCategory(patch.category ?? doc.category);
    if (typeof amount === "number") writeBack.amount = amount;
    if (currency) writeBack.currency = currency;
    if (date) writeBack.expenseDate = date;
    if (category) writeBack.category = category;
    if (Object.keys(writeBack).length > 0) {
      await updateExpense(expenseId, ownerId, writeBack);
    }
  }

  await db.collection(ANALYSIS_COLLECTION).doc(doc.id).update(updates);
  const fresh = await loadDocById(doc.id);
  return toView(fresh!);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If `updateExpense`'s input type rejects a `Record`, cast the write-back object to its `UpdateExpenseInput` type, imported from `./expense.service`.)

- [ ] **Step 3: Manual smoke (mock provider, real Firestore)**

This is verified end-to-end once the routes exist (Task 10). No commit-blocking manual step here beyond typecheck.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/expenseAnalysis.service.ts
git commit -m "feat(ai): add expenseAnalysis service (async worker + write-back)"
```

---

## Task 8: Validation schema

**Files:**
- Create: `backend/src/validation/expenseAnalysis.schema.ts`

**Interfaces:**
- Produces: `updateAnalysisBody` (Zod). Consumed by the controller/routes.
- Consumes: `dateString` from `./common`.

- [ ] **Step 1: Implement the schema**

```ts
import { z } from "zod";

import { dateString } from "./common";

/** PATCH /expenses/:id/analysis — employee edits + optional confirm. */
export const updateAnalysisBody = z
  .object({
    vendorName: z.string().trim().max(200).optional(),
    amount: z.number().finite().positive().optional(),
    transactionDate: dateString.optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    paymentMethod: z.string().trim().max(50).optional(),
    category: z.string().trim().max(50).optional(),
    taxInformation: z.string().trim().max(200).optional(),
    confirm: z.boolean().optional().default(false),
  })
  .strict();
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/validation/expenseAnalysis.schema.ts
git commit -m "feat(ai): add expenseAnalysis validation schema"
```

---

## Task 9: Controller

**Files:**
- Create: `backend/src/controllers/expenseAnalysis.controller.ts`

**Interfaces:**
- Produces: `postAnalyze`, `getAnalysis`, `patchAnalysis` (Express handlers).
- Consumes: service fns (Task 7), `requireExpense` + `canView` logic (mirror expense controller), `IdParams` from `../validation/common`.

- [ ] **Step 1: Implement the controller**

```ts
import type { Request, Response } from "express";

import { ApiError } from "../utils/errors";
import UserRole from "../types/roles";
import type { JwtPayload } from "../types/auth.types";
import { requireExpense } from "../services/expense.service";
import {
  analyzeExpense,
  getAnalysisByExpenseId,
  updateAnalysis,
  type UpdateAnalysisInput,
} from "../services/expenseAnalysis.service";
import type { ExpenseDocument } from "../types/expense.types";
import type { IdParams } from "../validation/common";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("Unexpected expense-analysis error:", err);
  return res.status(500).json({ error: "Internal server error" });
}

/** Owner, HR, and ADMIN may read analysis (not employees' private drafts of others). */
function canViewAnalysis(expense: ExpenseDocument, user: JwtPayload): boolean {
  if (user.role === UserRole.HR || user.role === UserRole.ADMIN) {
    return expense.approvalStatus !== "DRAFT";
  }
  return expense.employeeId === user.userId;
}

/** POST /expenses/:id/analyze — EMPLOYEE owner triggers analysis. */
export async function postAnalyze(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const analysis = await analyzeExpense(id, req.user.userId);
    return res.status(202).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}

/** GET /expenses/:id/analysis — owner / HR / ADMIN. */
export async function getAnalysis(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const expense = await requireExpense(id);
    if (!canViewAnalysis(expense, req.user)) {
      return res.status(403).json({ error: "You do not have access to this analysis" });
    }
    const analysis = await getAnalysisByExpenseId(id);
    return res.status(200).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}

/** PATCH /expenses/:id/analysis — EMPLOYEE owner edits/confirms. */
export async function patchAnalysis(req: Request, res: Response): Promise<Response> {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  try {
    const { id } = req.valid?.params as IdParams;
    const patch = req.valid?.body as UpdateAnalysisInput;
    const analysis = await updateAnalysis(id, req.user.userId, patch);
    return res.status(200).json(analysis);
  } catch (err) {
    return handleError(res, err);
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/expenseAnalysis.controller.ts
git commit -m "feat(ai): add expenseAnalysis controller"
```

---

## Task 10: Routes wiring + end-to-end manual smoke

**Files:**
- Modify: `backend/src/routes/expense.routes.ts`

**Interfaces:**
- Consumes: controller (Task 9); existing `authenticate`, `authorize`, `validate`, `idParams`, `UserRole`.

- [ ] **Step 1: Add imports to `expense.routes.ts`**

Add near the other controller imports:
```ts
import {
  getAnalysis,
  patchAnalysis,
  postAnalyze,
} from "../controllers/expenseAnalysis.controller";
import { updateAnalysisBody } from "../validation/expenseAnalysis.schema";
```

- [ ] **Step 2: Register the three routes (after the `/:id/document` routes, before `export default router`)**

```ts
// EMPLOYEE — trigger AI analysis of the receipt (async; client polls).
router.post(
  "/:id/analyze",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams }),
  postAnalyze,
);

// owner / HR / ADMIN — read the analysis result.
router.get(
  "/:id/analysis",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.HR, UserRole.EMPLOYEE),
  validate({ params: idParams }),
  getAnalysis,
);

// EMPLOYEE — edit/confirm extracted values (confirm writes back to the expense).
router.patch(
  "/:id/analysis",
  authenticate,
  authorize(UserRole.EMPLOYEE),
  validate({ params: idParams, body: updateAnalysisBody }),
  patchAnalysis,
);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual end-to-end smoke (mock provider)**

With `AI_PROVIDER=mock` and the dev server running (`npm run dev`), as an EMPLOYEE with a DRAFT expense that has an uploaded document:
```bash
# Replace TOKEN and EXPENSE_ID.
curl -s -X POST localhost:5000/expenses/EXPENSE_ID/analyze -H "Authorization: Bearer TOKEN"
curl -s localhost:5000/expenses/EXPENSE_ID/analysis -H "Authorization: Bearer TOKEN"
```
Expected: POST returns `202` with `status: "PENDING"`; a follow-up GET shows `COMPLETED` or `LOW_CONFIDENCE` with `vendorName/amount/...`. For an expense with no document, POST yields `status: "FAILED"`, `failureReason: "No document to analyze"`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/expense.routes.ts
git commit -m "feat(ai): wire expenseAnalysis routes"
```

---

## Task 11: Frontend types + status metadata + category prefill (TDD)

**Files:**
- Create: `frontend/src/types/expenseAnalysis.ts`
- Test: `frontend/src/types/expenseAnalysis.test.ts`

**Interfaces:**
- Produces: `AnalysisStatus`, `ExpenseAnalysis`, `UpdateAnalysisPayload`, `ANALYSIS_STATUS_META` (`Record<AnalysisStatus,{label:string;tone:"slate"|"blue"|"emerald"|"amber"|"red";spinner:boolean}>`), `isTerminalStatus(s)`, `mapToExpenseCategory(raw)`.

- [ ] **Step 1: Write the failing test** — `frontend/src/types/expenseAnalysis.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ANALYSIS_STATUS_META,
  isTerminalStatus,
  mapToExpenseCategory,
} from "./expenseAnalysis";

describe("ANALYSIS_STATUS_META", () => {
  it("covers all five statuses with a label + tone", () => {
    for (const s of ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "LOW_CONFIDENCE"] as const) {
      expect(ANALYSIS_STATUS_META[s].label.length).toBeGreaterThan(0);
      expect(ANALYSIS_STATUS_META[s].tone).toBeTruthy();
    }
  });
  it("marks PENDING/PROCESSING with a spinner", () => {
    expect(ANALYSIS_STATUS_META.PROCESSING.spinner).toBe(true);
    expect(ANALYSIS_STATUS_META.COMPLETED.spinner).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("treats COMPLETED/LOW_CONFIDENCE/FAILED as terminal", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isTerminalStatus("PENDING")).toBe(false);
    expect(isTerminalStatus("PROCESSING")).toBe(false);
  });
});

describe("mapToExpenseCategory", () => {
  it("maps synonyms and exact names, else undefined", () => {
    expect(mapToExpenseCategory("Meals")).toBe("FOOD");
    expect(mapToExpenseCategory("TRAVEL")).toBe("TRAVEL");
    expect(mapToExpenseCategory("Spaceship")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- expenseAnalysis`
Expected: FAIL — cannot resolve `./expenseAnalysis`.

- [ ] **Step 3: Implement `frontend/src/types/expenseAnalysis.ts`**

```ts
import type { ExpenseCategory } from "./expense";

export type AnalysisStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "LOW_CONFIDENCE";

export interface ExpenseAnalysis {
  id: string;
  expenseId: string;
  documentId: string;
  status: AnalysisStatus;
  modelVersion?: string;
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confidenceScore?: number;
  extractedData?: Record<string, unknown>;
  failureReason?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAnalysisPayload {
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  confirm?: boolean;
}

type Tone = "slate" | "blue" | "emerald" | "amber" | "red";

export const ANALYSIS_STATUS_META: Record<
  AnalysisStatus,
  { label: string; tone: Tone; spinner: boolean }
> = {
  PENDING: { label: "Queued for analysis", tone: "slate", spinner: true },
  PROCESSING: { label: "Reading your receipt…", tone: "blue", spinner: true },
  COMPLETED: { label: "Analysis complete", tone: "emerald", spinner: false },
  LOW_CONFIDENCE: { label: "Low confidence — please verify", tone: "amber", spinner: false },
  FAILED: { label: "Analysis failed", tone: "red", spinner: false },
};

export function isTerminalStatus(s: AnalysisStatus): boolean {
  return s === "COMPLETED" || s === "LOW_CONFIDENCE" || s === "FAILED";
}

const CATEGORY_VALUES: ExpenseCategory[] = [
  "TRAVEL", "FOOD", "SOFTWARE", "HARDWARE", "TRAINING",
  "CLOUD_SERVICES", "OFFICE_SUPPLIES", "MISCELLANEOUS",
];
const SYNONYMS: ReadonlyArray<[string, ExpenseCategory]> = [
  ["cloud", "CLOUD_SERVICES"], ["aws", "CLOUD_SERVICES"], ["azure", "CLOUD_SERVICES"],
  ["software", "SOFTWARE"], ["subscription", "SOFTWARE"], ["saas", "SOFTWARE"],
  ["hardware", "HARDWARE"], ["laptop", "HARDWARE"], ["device", "HARDWARE"],
  ["travel", "TRAVEL"], ["taxi", "TRAVEL"], ["uber", "TRAVEL"], ["flight", "TRAVEL"], ["hotel", "TRAVEL"],
  ["food", "FOOD"], ["meal", "FOOD"], ["restaurant", "FOOD"],
  ["training", "TRAINING"], ["course", "TRAINING"],
  ["office", "OFFICE_SUPPLIES"], ["stationery", "OFFICE_SUPPLIES"], ["supplies", "OFFICE_SUPPLIES"],
];

/** Map AI free-text category to a valid ExpenseCategory for prefill, or undefined. */
export function mapToExpenseCategory(
  raw: string | null | undefined,
): ExpenseCategory | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((CATEGORY_VALUES as string[]).includes(norm)) return norm as ExpenseCategory;
  const lower = raw.toLowerCase();
  for (const [needle, cat] of SYNONYMS) if (lower.includes(needle)) return cat;
  return undefined;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- expenseAnalysis`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/expenseAnalysis.ts frontend/src/types/expenseAnalysis.test.ts
git commit -m "feat(ai): add frontend analysis types + status/category metadata"
```

---

## Task 12: Frontend API client

**Files:**
- Create: `frontend/src/lib/expense-analysis-api.ts`

**Interfaces:**
- Produces: `analyzeExpense(id)`, `getExpenseAnalysis(id)`, `updateExpenseAnalysis(id, payload)`.
- Consumes: shared `api` from `./api`; types from `../types/expenseAnalysis`.

- [ ] **Step 1: Implement the client**

```ts
import { api } from "./api";
import type {
  ExpenseAnalysis,
  UpdateAnalysisPayload,
} from "../types/expenseAnalysis";

/** Trigger (or re-run) AI analysis. Returns the row in PENDING/PROCESSING/FAILED. */
export async function analyzeExpense(id: string): Promise<ExpenseAnalysis> {
  const { data } = await api.post<ExpenseAnalysis>(`/expenses/${id}/analyze`, {});
  return data;
}

/** Read the analysis (null if none yet). */
export async function getExpenseAnalysis(
  id: string,
): Promise<ExpenseAnalysis | null> {
  const { data } = await api.get<ExpenseAnalysis | null>(`/expenses/${id}/analysis`);
  return data;
}

/** Save edits / confirm. confirm=true writes verified values back to the expense. */
export async function updateExpenseAnalysis(
  id: string,
  payload: UpdateAnalysisPayload,
): Promise<ExpenseAnalysis> {
  const { data } = await api.patch<ExpenseAnalysis>(
    `/expenses/${id}/analysis`,
    payload,
  );
  return data;
}
```

- [ ] **Step 2: Typecheck via build**

Run: `npm run build`
Expected: compiles (no type errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/expense-analysis-api.ts
git commit -m "feat(ai): add frontend expense-analysis API client"
```

---

## Task 13: Status badge + confidence meter components

**Files:**
- Create: `frontend/src/components/expenses/AnalysisStatusBadge.tsx`
- Create: `frontend/src/components/expenses/ConfidenceMeter.tsx`

**Interfaces:**
- Produces: `<AnalysisStatusBadge status={AnalysisStatus} />`, `<ConfidenceMeter score={number} />`.
- Consumes: `Badge` from `../ui/badge`; `ANALYSIS_STATUS_META` (Task 11); `Loader2` from `lucide-react`.

- [ ] **Step 1: Implement `AnalysisStatusBadge.tsx`**

```tsx
import { Loader2 } from "lucide-react";

import { Badge } from "../ui/badge";
import {
  ANALYSIS_STATUS_META,
  type AnalysisStatus,
} from "../../types/expenseAnalysis";

const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const meta = ANALYSIS_STATUS_META[status];
  return (
    <Badge variant="outline" className={`gap-1 border-0 ${TONE_CLASS[meta.tone]}`}>
      {meta.spinner && <Loader2 className="size-3 animate-spin" />}
      {meta.label}
    </Badge>
  );
}
```

- [ ] **Step 2: Implement `ConfidenceMeter.tsx`**

```tsx
/** Confidence as a 0–100 bar; green ≥80, amber ≥60, red below. */
export function ConfidenceMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color =
    clamped >= 80 ? "bg-emerald-500" : clamped >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-sm font-medium text-foreground">{clamped}%</span>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify types/JSX**

Run: `npm run build`
Expected: compiles. (If `../ui/badge` casing differs, match the existing import path used in `ExpenseBadges.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/expenses/AnalysisStatusBadge.tsx frontend/src/components/expenses/ConfidenceMeter.tsx
git commit -m "feat(ai): add analysis status badge + confidence meter"
```

---

## Task 14: ReceiptPreview component

**Files:**
- Create: `frontend/src/components/expenses/ReceiptPreview.tsx`

**Interfaces:**
- Produces: `<ReceiptPreview expenseId={string} />` — fetches the document blob and renders an image or a PDF `<iframe>`; shows a fallback when there is no document.
- Consumes: `fetchExpenseDocumentObjectUrl`, `getExpenseDocument` from `../../lib/expenses-api`.

- [ ] **Step 1: Implement `ReceiptPreview.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  fetchExpenseDocumentObjectUrl,
  getExpenseDocument,
} from "../../lib/expenses-api";

export function ReceiptPreview({ expenseId }: { expenseId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const meta = await getExpenseDocument(expenseId);
        const objUrl = await fetchExpenseDocumentObjectUrl(expenseId, false);
        if (cancelled) {
          URL.revokeObjectURL(objUrl);
          return;
        }
        objectUrl = objUrl;
        setMime(meta.mimeType);
        setUrl(objUrl);
      } catch {
        if (!cancelled) setError("Could not load the receipt preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [expenseId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border bg-muted/30 text-sm text-muted-foreground">
        {error ?? "No receipt to preview"}
      </div>
    );
  }
  if (mime === "application/pdf") {
    return <iframe title="Receipt" src={url} className="h-96 w-full rounded-md border" />;
  }
  return (
    <img
      src={url}
      alt="Receipt"
      className="max-h-96 w-full rounded-md border object-contain"
    />
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/expenses/ReceiptPreview.tsx
git commit -m "feat(ai): add reusable ReceiptPreview component"
```

---

## Task 15: Analysis Review page (trigger + polling)

**Files:**
- Create: `frontend/src/pages/expenses/AnalysisReviewPage.tsx`

**Interfaces:**
- Produces: `AnalysisReviewPage` (default route element). Route: `/employee/expenses/:id/analysis`.
- Consumes: `analyzeExpense`, `getExpenseAnalysis` (Task 12); `getExpense` from `../../lib/expenses-api`; `ReceiptPreview`, `AnalysisStatusBadge`, `ConfidenceMeter`; `isTerminalStatus`; `useNavigate`/`useParams`; `Card*`, `Button` from ui; `toast` from `sonner`.

- [ ] **Step 1: Implement `AnalysisReviewPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { AnalysisStatusBadge } from "../../components/expenses/AnalysisStatusBadge";
import { ConfidenceMeter } from "../../components/expenses/ConfidenceMeter";
import { ReceiptPreview } from "../../components/expenses/ReceiptPreview";
import { analyzeExpense, getExpenseAnalysis } from "../../lib/expense-analysis-api";
import { getExpense } from "../../lib/expenses-api";
import {
  isTerminalStatus,
  type ExpenseAnalysis,
} from "../../types/expenseAnalysis";

const POLL_MS = 2000;

export function AnalysisReviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [hasDocument, setHasDocument] = useState<boolean | null>(null);
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    const next = await getExpenseAnalysis(id);
    setAnalysis(next);
    if (next && isTerminalStatus(next.status)) stopPolling();
  }, [id, stopPolling]);

  useEffect(() => {
    (async () => {
      const expense = await getExpense(id);
      setHasDocument(Boolean(expense.documentId));
      const existing = await getExpenseAnalysis(id);
      setAnalysis(existing);
      if (existing && !isTerminalStatus(existing.status)) {
        timer.current = window.setInterval(poll, POLL_MS);
      }
    })();
    return stopPolling;
  }, [id, poll, stopPolling]);

  const onAnalyze = async () => {
    setBusy(true);
    try {
      const started = await analyzeExpense(id);
      setAnalysis(started);
      if (!isTerminalStatus(started.status)) {
        stopPolling();
        timer.current = window.setInterval(poll, POLL_MS);
      }
    } catch {
      toast.error("Could not start analysis.");
    } finally {
      setBusy(false);
    }
  };

  const canVerify =
    analysis?.status === "COMPLETED" || analysis?.status === "LOW_CONFIDENCE";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptPreview expenseId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">AI analysis</CardTitle>
          {analysis && <AnalysisStatusBadge status={analysis.status} />}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {hasDocument === false && (
            <p className="text-sm text-muted-foreground">
              Upload a receipt to this expense to enable AI analysis.
            </p>
          )}

          {hasDocument && !analysis && (
            <Button onClick={onAnalyze} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Analyze Receipt
            </Button>
          )}

          {analysis?.status === "FAILED" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-red-600">
                {analysis.failureReason ?? "Analysis failed."}
              </p>
              <div className="flex gap-2">
                <Button onClick={onAnalyze} disabled={busy} variant="outline">
                  Retry
                </Button>
                <Button onClick={() => navigate(`../${id}/edit`)} variant="ghost">
                  Enter manually
                </Button>
              </div>
            </div>
          )}

          {analysis && (analysis.status === "PENDING" || analysis.status === "PROCESSING") && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading your receipt — this can take a few seconds.
            </p>
          )}

          {canVerify && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Vendor" value={analysis?.vendorName} />
              <Field label="Amount" value={analysis?.amount?.toString()} />
              <Field label="Date" value={analysis?.transactionDate} />
              <Field label="Currency" value={analysis?.currency} />
              <Field label="Category" value={analysis?.category} />
              <Field label="Payment method" value={analysis?.paymentMethod} />
              <Field label="Tax info" value={analysis?.taxInformation} />
            </dl>
          )}

          {canVerify && typeof analysis?.confidenceScore === "number" && (
            <ConfidenceMeter score={analysis.confidenceScore} />
          )}

          {canVerify && (
            <Button onClick={() => navigate(`../${id}/verify`)}>
              Verify &amp; edit →
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles. (Confirm `getExpense` is exported from `lib/expenses-api`; if it has a different name, match it.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/expenses/AnalysisReviewPage.tsx
git commit -m "feat(ai): add Analysis Review page with trigger + polling"
```

---

## Task 16: Expense Verification page (edit + confirm + submit)

**Files:**
- Create: `frontend/src/pages/expenses/ExpenseVerificationPage.tsx`

**Interfaces:**
- Produces: `ExpenseVerificationPage`. Route: `/employee/expenses/:id/verify`.
- Consumes: `getExpenseAnalysis`, `updateExpenseAnalysis` (Task 12); `submitExpense` from `../../lib/expenses-api`; `ReceiptPreview`; `mapToExpenseCategory`; `CATEGORY_LABELS` from `../../types/expense`; ui `Input`, `Label`, `Select*`, `Button`, `Card*`; `toast`.

- [ ] **Step 1: Implement `ExpenseVerificationPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { ReceiptPreview } from "../../components/expenses/ReceiptPreview";
import { getExpenseAnalysis, updateExpenseAnalysis } from "../../lib/expense-analysis-api";
import { submitExpense } from "../../lib/expenses-api";
import { mapToExpenseCategory } from "../../types/expenseAnalysis";
import { CATEGORY_LABELS, type ExpenseCategory } from "../../types/expense";

interface Form {
  vendorName: string;
  amount: string;
  transactionDate: string;
  currency: string;
  paymentMethod: string;
  category: ExpenseCategory | "";
  taxInformation: string;
}

export function ExpenseVerificationPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await getExpenseAnalysis(id);
      setForm({
        vendorName: a?.vendorName ?? "",
        amount: a?.amount != null ? String(a.amount) : "",
        transactionDate: a?.transactionDate ?? "",
        currency: a?.currency ?? "INR",
        paymentMethod: a?.paymentMethod ?? "",
        category: mapToExpenseCategory(a?.category) ?? "",
        taxInformation: a?.taxInformation ?? "",
      });
    })();
  }, [id]);

  if (!form) return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const confirmAndSubmit = async () => {
    setSaving(true);
    try {
      await updateExpenseAnalysis(id, {
        vendorName: form.vendorName || undefined,
        amount: form.amount ? Number(form.amount) : undefined,
        transactionDate: form.transactionDate || undefined,
        currency: form.currency || undefined,
        paymentMethod: form.paymentMethod || undefined,
        category: form.category || undefined,
        taxInformation: form.taxInformation || undefined,
        confirm: true,
      });
      await submitExpense(id);
      toast.success("Expense submitted for approval.");
      navigate(`../${id}`);
    } catch {
      toast.error("Could not submit. Check the values and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          <ReceiptPreview expenseId={id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verify extracted values</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Labeled label="Vendor">
            <Input value={form.vendorName} onChange={(e) => set("vendorName", e.target.value)} />
          </Labeled>
          <Labeled label="Amount">
            <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
          </Labeled>
          <Labeled label="Date">
            <Input type="date" value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} />
          </Labeled>
          <Labeled label="Currency">
            <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} />
          </Labeled>
          <Labeled label="Payment method">
            <Input value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} />
          </Labeled>
          <Labeled label="Category">
            <Select value={form.category} onValueChange={(v) => set("category", v as ExpenseCategory)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labeled>
          <Labeled label="Tax info">
            <Input value={form.taxInformation} onChange={(e) => set("taxInformation", e.target.value)} />
          </Labeled>

          <div className="flex gap-2 pt-2">
            <Button onClick={confirmAndSubmit} disabled={saving}>
              Confirm &amp; submit for approval
            </Button>
            <Button variant="ghost" onClick={() => navigate(`../${id}/analysis`)}>
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: compiles. (Confirm `CATEGORY_LABELS`, `submitExpense`, and the `Select`/`Input`/`Label` import paths match existing usage in `SubmitExpensePage.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/expenses/ExpenseVerificationPage.tsx
git commit -m "feat(ai): add Expense Verification page (confirm + submit)"
```

---

## Task 17: Routing + entry button + full manual verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/expenses/ExpenseDetailsPage.tsx`

**Interfaces:**
- Consumes: `AnalysisReviewPage` (Task 15), `ExpenseVerificationPage` (Task 16).

- [ ] **Step 1: Import the pages in `App.tsx`**

Add with the other expense-page imports:
```tsx
import { AnalysisReviewPage } from "./pages/expenses/AnalysisReviewPage";
import { ExpenseVerificationPage } from "./pages/expenses/ExpenseVerificationPage";
```

- [ ] **Step 2: Register the two routes under the EMPLOYEE block**

Inside the `/employee` `<Route>` group, add **before** the `expenses/:id` route (so the more specific paths match first):
```tsx
<Route path="expenses/:id/analysis" element={<AnalysisReviewPage />} />
<Route path="expenses/:id/verify" element={<ExpenseVerificationPage />} />
```

- [ ] **Step 3: Add the "Analyze Receipt" entry button in `ExpenseDetailsPage.tsx`**

In the employee DRAFT actions area, render the link only when the expense has a document and the viewer is the owner on a DRAFT. Use the existing role/ownership variables in that file (e.g. `isOwner`, `expense.approvalStatus`); add:
```tsx
{expense.documentId && expense.approvalStatus === "DRAFT" && (
  <Button variant="outline" onClick={() => navigate(`${expense.id}/analysis`)}>
    <Sparkles className="size-4" />
    Analyze Receipt
  </Button>
)}
```
Add `import { Sparkles } from "lucide-react";` if not already imported, and ensure `navigate` (from `useNavigate`) is available in that component. Match the exact base path the page already uses for its other links (relative vs absolute).

- [ ] **Step 4: Build + full typecheck**

Run: `cd frontend && npm run build` → Expected: compiles.
Run: `cd backend && npm run typecheck && npm test` → Expected: no errors, all tests pass.

- [ ] **Step 5: Manual end-to-end (mock provider)**

With backend (`AI_PROVIDER=mock`) and frontend dev servers running, signed in as an EMPLOYEE:
1. Create a DRAFT expense and upload an image receipt.
2. On the details page, click **Analyze Receipt** → lands on Analysis Review.
3. Click **Analyze Receipt** → status shows PENDING/PROCESSING, then COMPLETED or LOW_CONFIDENCE with fields + confidence.
4. Click **Verify & edit →**, adjust a value, **Confirm & submit** → expense becomes SUBMITTED and the edited values are saved on the expense.
5. Verify the **Analyze Receipt** button is **absent** on an expense with no document.

Expected: all steps pass; no raw IDs shown.

- [ ] **Step 6: Optional — verify real Kimi (manual, requires a valid key)**

Set `AI_PROVIDER=kimi` and a valid `NVIDIA_API_KEY` in `backend/.env`, restart, repeat step 3 with a real receipt image and a PDF. Expected: real extracted values; malformed/again-unreadable cases surface as FAILED with a reason and a working Retry.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/expenses/ExpenseDetailsPage.tsx
git commit -m "feat(ai): wire analysis/verify routes + Analyze Receipt entry button"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** data model (Task 2), validation (Task 8), service (Task 7), controller (Task 9), routes (Task 10), 3 endpoints (Task 10), mock (Task 4), real Kimi with verified wire format/JSON/auth (Task 6), document conversion incl. webp→jpg + PDF page-1 raster (Task 5), parse+validate-before-persist + raw-output preservation + malformed→FAILED+retry (Tasks 3, 6, 7), async worker + polling (Tasks 7, 15), two employee pages + receipt preview + 5 status UI states + confidence (Tasks 13–16), hide Analyze button when no document (Tasks 15, 17), write-back to Expense as source of truth (Task 7), expenseAnalysis audit trail (Task 7), workflow unchanged (verified by reuse of `updateExpense`/`submitExpense`).
- **Type consistency:** `ExtractionResult`/`ExtractionInput`/`ExpenseExtractor` defined once (Tasks 3–4) and reused (Tasks 6–7). `AnalysisStatus`/`ExpenseAnalysis` shared shape backend (Task 2) ↔ frontend (Task 11). `mapToExpenseCategory` exists on both sides (synonyms identical).
- **Residual risks to watch during implementation:** `pdf-to-img` ESM interop (handled via dynamic `import()`); hosted NVIDIA inline base64 size limit (mitigated by ≤1600px + JPEG q80; if 4xx on large images, add NVCF asset-upload — out of scope here); exact ui import path casings (match neighboring files).
