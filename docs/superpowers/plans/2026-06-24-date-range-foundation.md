# Date-Range Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable frontend and backend primitives that make the date-range filter authoritative and always-visible, before wiring them into individual screens (Plan 3).

**Architecture:** Frontend converts the existing `DateRange` (epoch-ms bounds) to ISO `from`/`to` query params and to a human label/filename slug; a shared `ActiveRangeBadge` renders the label. Backend gains a reusable optional `from`/`to` Zod fragment and an in-memory `withinIsoRange`/`filterByDateWindow` helper (mirrors the existing `getExpensesReport` trailing-window pattern — no Firestore composite indexes).

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library (frontend & backend), Zod, Firestore (firebase-admin `Timestamp`).

## Global Constraints

- In-memory date filtering only — NO Firestore composite indexes / range `where()` clauses.
- `from`/`to` are inclusive ISO datetime strings (preserve end-of-day precision from `DateRange.toMs`).
- A screen's charts, KPIs, tables, and exports must all read from ONE filtered dataset (enforced in Plan 3; the foundation must not preclude it).
- Frontend tests: `npx vitest run <path>` from `frontend/`. Backend tests: `npx vitest run <path>` from `backend/`.
- Do not change existing exports of `frontend/src/lib/date-range.ts`; only add to it.

---

### Task 1: `rangeToParams` — DateRange → ISO query params (frontend)

**Files:**
- Modify: `frontend/src/lib/date-range.ts` (append)
- Test: `frontend/src/lib/date-range.test.ts` (create)

**Interfaces:**
- Consumes: `DateRange` (existing, same file).
- Produces: `rangeToParams(range: DateRange): { from?: string; to?: string }` — omits a bound when its `*Ms` is null; otherwise emits `new Date(ms).toISOString()`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/date-range.test.ts
import { describe, expect, it } from "vitest";
import { makeRange, rangeToParams } from "./date-range";

describe("rangeToParams", () => {
  it("omits both bounds for all-time", () => {
    expect(rangeToParams(makeRange("all"))).toEqual({});
  });

  it("emits ISO from/to for a bounded custom range", () => {
    const r = makeRange("custom", "2026-01-01", "2026-03-31");
    const p = rangeToParams(r);
    expect(p.from).toBe(new Date(r.fromMs as number).toISOString());
    expect(p.to).toBe(new Date(r.toMs as number).toISOString());
  });

  it("omits the missing bound of a half-open custom range", () => {
    const r = makeRange("custom", "2026-01-01", undefined);
    const p = rangeToParams(r);
    expect(p.from).toBeDefined();
    expect(p.to).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/date-range.test.ts`
Expected: FAIL — `rangeToParams` is not exported.

- [ ] **Step 3: Implement (append to `date-range.ts`)**

```ts
/** Convert a resolved range to inclusive ISO query params for the backend.
 *  Unbounded sides are omitted so "all time" sends no params. */
export function rangeToParams(range: DateRange): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (range.fromMs != null) out.from = new Date(range.fromMs).toISOString();
  if (range.toMs != null) out.to = new Date(range.toMs).toISOString();
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/date-range.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/date-range.ts frontend/src/lib/date-range.test.ts
git commit -m "feat(dates): rangeToParams converts DateRange to ISO query params"
```

---

### Task 2: `rangeLabel` + `rangeSlug` — human label & filename slug (frontend)

**Files:**
- Modify: `frontend/src/lib/date-range.ts` (append)
- Modify: `frontend/src/lib/date-range.test.ts` (add cases)

**Interfaces:**
- Consumes: `DateRange`, `DATE_PRESETS` (existing).
- Produces:
  - `rangeLabel(range: DateRange): string` — preset label, or for custom with bounds a formatted "D Mon YYYY – D Mon YYYY".
  - `rangeSlug(range: DateRange): string` — filename-safe token (e.g. `last-30-days`, `all-time`, `2026-01-01_2026-03-31`).

- [ ] **Step 1: Write the failing tests (append)**

```ts
// append to frontend/src/lib/date-range.test.ts
import { rangeLabel, rangeSlug } from "./date-range";

describe("rangeLabel", () => {
  it("uses the preset label for non-custom ranges", () => {
    expect(rangeLabel(makeRange("30d"))).toBe("Last 30 days");
    expect(rangeLabel(makeRange("all"))).toBe("All time");
  });

  it("formats a custom range with both bounds", () => {
    expect(rangeLabel(makeRange("custom", "2026-01-01", "2026-03-31"))).toBe(
      "1 Jan 2026 – 31 Mar 2026",
    );
  });

  it("falls back to 'Custom range' when bounds are missing", () => {
    expect(rangeLabel(makeRange("custom"))).toBe("Custom range");
  });
});

describe("rangeSlug", () => {
  it("slugs presets", () => {
    expect(rangeSlug(makeRange("30d"))).toBe("last-30-days");
    expect(rangeSlug(makeRange("all"))).toBe("all-time");
  });

  it("slugs a custom range by its dates", () => {
    expect(rangeSlug(makeRange("custom", "2026-01-01", "2026-03-31"))).toBe(
      "2026-01-01_2026-03-31",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/date-range.test.ts`
Expected: FAIL — `rangeLabel`/`rangeSlug` not exported.

- [ ] **Step 3: Implement (append to `date-range.ts`)**

```ts
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Format a yyyy-mm-dd string as "D Mon YYYY" without timezone surprises. */
function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11 || !d) return ymd;
  return `${Number(d)} ${MONTHS[mi]} ${y}`;
}

const PRESET_SLUGS: Record<DateRangePreset, string> = {
  all: "all-time",
  today: "today",
  "7d": "last-7-days",
  "30d": "last-30-days",
  quarter: "last-quarter",
  "6mo": "last-6-months",
  year: "last-year",
  custom: "custom",
};

/** Human label for the active range (for the always-visible range badge). */
export function rangeLabel(range: DateRange): string {
  if (range.preset === "custom") {
    if (range.customStart && range.customEnd) {
      return `${fmtYmd(range.customStart)} – ${fmtYmd(range.customEnd)}`;
    }
    if (range.customStart) return `From ${fmtYmd(range.customStart)}`;
    if (range.customEnd) return `Until ${fmtYmd(range.customEnd)}`;
    return "Custom range";
  }
  return DATE_PRESETS.find((p) => p.value === range.preset)?.label ?? "All time";
}

/** Filename-safe token describing the range, for export filenames. */
export function rangeSlug(range: DateRange): string {
  if (range.preset === "custom") {
    return `${range.customStart ?? "start"}_${range.customEnd ?? "end"}`;
  }
  return PRESET_SLUGS[range.preset];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/date-range.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/date-range.ts frontend/src/lib/date-range.test.ts
git commit -m "feat(dates): rangeLabel and rangeSlug for the active-range badge and exports"
```

---

### Task 3: `ActiveRangeBadge` component (frontend)

**Files:**
- Create: `frontend/src/components/common/ActiveRangeBadge.tsx`
- Create: `frontend/src/components/common/ActiveRangeBadge.test.tsx`

**Interfaces:**
- Consumes: `DateRange`, `rangeLabel` (Task 2).
- Produces: `ActiveRangeBadge({ range, className }: { range: DateRange; className?: string })` — a small inline element showing a calendar icon + `rangeLabel(range)`, with `data-testid="active-range-badge"`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/common/ActiveRangeBadge.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActiveRangeBadge } from "./ActiveRangeBadge";
import { makeRange } from "@/lib/date-range";

afterEach(cleanup);

describe("ActiveRangeBadge", () => {
  it("shows the active preset label", () => {
    render(<ActiveRangeBadge range={makeRange("30d")} />);
    expect(screen.getByTestId("active-range-badge")).toHaveTextContent(
      "Last 30 days",
    );
  });

  it("shows a custom range's formatted dates", () => {
    render(<ActiveRangeBadge range={makeRange("custom", "2026-01-01", "2026-03-31")} />);
    expect(screen.getByTestId("active-range-badge")).toHaveTextContent(
      "1 Jan 2026 – 31 Mar 2026",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/common/ActiveRangeBadge.test.tsx`
Expected: FAIL — cannot resolve `./ActiveRangeBadge`.

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/common/ActiveRangeBadge.tsx
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { rangeLabel, type DateRange } from "@/lib/date-range";

/** Always-visible label of the active date range, shown near a page title and
 *  in export headers so users always know the scope of what they're viewing. */
export function ActiveRangeBadge({
  range,
  className,
}: {
  range: DateRange;
  className?: string;
}) {
  return (
    <span
      data-testid="active-range-badge"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <CalendarRange className="size-3.5" />
      {rangeLabel(range)}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/common/ActiveRangeBadge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/ActiveRangeBadge.tsx frontend/src/components/common/ActiveRangeBadge.test.tsx
git commit -m "feat(dates): ActiveRangeBadge shows the always-visible active range"
```

---

### Task 4: Reusable `dateRangeQuery` Zod fragment (backend)

**Files:**
- Modify: `backend/src/validation/common.ts` (append)
- Create: `backend/src/validation/common.test.ts`

**Interfaces:**
- Consumes: `dateString` (existing in same file).
- Produces:
  - `dateRangeQuery` — `z.object({ from: dateString.optional(), to: dateString.optional() })`
  - `type DateRangeParams = { from?: string; to?: string }`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/validation/common.test.ts
import { describe, expect, it } from "vitest";
import { dateRangeQuery } from "./common";

describe("dateRangeQuery", () => {
  it("accepts optional ISO from/to", () => {
    expect(dateRangeQuery.parse({})).toEqual({});
    const parsed = dateRangeQuery.parse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-03-31T23:59:59.999Z",
    });
    expect(parsed.from).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.to).toBe("2026-03-31T23:59:59.999Z");
  });

  it("rejects a non-date from", () => {
    expect(() => dateRangeQuery.parse({ from: "not-a-date" })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `backend/`): `npx vitest run src/validation/common.test.ts`
Expected: FAIL — `dateRangeQuery` not exported.

- [ ] **Step 3: Implement (append to `common.ts`)**

```ts
/**
 * Reusable optional date-range query params (inclusive ISO bounds). Merge into
 * any list endpoint's query schema: `listFooQuery.merge(dateRangeQuery)`.
 */
export const dateRangeQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
});

export type DateRangeParams = z.infer<typeof dateRangeQuery>;
```

- [ ] **Step 4: Run to verify it passes**

Run (from `backend/`): `npx vitest run src/validation/common.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/validation/common.ts backend/src/validation/common.test.ts
git commit -m "feat(dates): reusable optional date-range query fragment"
```

---

### Task 5: `withinIsoRange` + `filterByDateWindow` helper (backend)

**Files:**
- Create: `backend/src/utils/date-window.ts`
- Create: `backend/src/utils/date-window.test.ts`

**Interfaces:**
- Consumes: nothing (duck-types Firestore `Timestamp` via `toMillis`/`toDate`/`seconds`).
- Produces:
  - `toMillis(value: unknown): number` — epoch ms or `NaN`.
  - `withinIsoRange(value: unknown, from?: string, to?: string): boolean` — unbounded ⇒ true; out-of-range or unparseable value ⇒ false.
  - `filterByDateWindow<T>(items: T[], getDate: (item: T) => unknown, from?: string, to?: string): T[]` — returns the same array when both bounds are absent.

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/utils/date-window.test.ts
import { describe, expect, it } from "vitest";
import { filterByDateWindow, withinIsoRange } from "./date-window";

const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2026-01-31T23:59:59.999Z";

describe("withinIsoRange", () => {
  it("returns true when both bounds are absent", () => {
    expect(withinIsoRange("2020-05-05", undefined, undefined)).toBe(true);
  });
  it("includes a string date inside the window (inclusive)", () => {
    expect(withinIsoRange("2026-01-15", FROM, TO)).toBe(true);
    expect(withinIsoRange("2026-02-01", FROM, TO)).toBe(false);
  });
  it("handles a Firestore-like Timestamp via toMillis", () => {
    const ts = { toMillis: () => Date.parse("2026-01-10") };
    expect(withinIsoRange(ts, FROM, TO)).toBe(true);
  });
  it("excludes unparseable values", () => {
    expect(withinIsoRange("nope", FROM, TO)).toBe(false);
    expect(withinIsoRange(null, FROM, TO)).toBe(false);
  });
});

describe("filterByDateWindow", () => {
  const rows = [{ d: "2026-01-10" }, { d: "2026-02-10" }];
  it("returns the same array when unbounded", () => {
    expect(filterByDateWindow(rows, (r) => r.d, undefined, undefined)).toBe(rows);
  });
  it("filters to the window", () => {
    expect(filterByDateWindow(rows, (r) => r.d, FROM, TO)).toEqual([
      { d: "2026-01-10" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `backend/`): `npx vitest run src/utils/date-window.test.ts`
Expected: FAIL — cannot resolve `./date-window`.

- [ ] **Step 3: Implement**

```ts
// backend/src/utils/date-window.ts

/** Best-effort epoch-ms from a string, number, Date, or Firestore Timestamp. */
export function toMillis(value: unknown): number {
  if (value == null) return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  if (typeof value === "object") {
    const v = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      _seconds?: number;
    };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v.seconds === "number") return v.seconds * 1000;
    if (typeof v._seconds === "number") return v._seconds * 1000;
  }
  return NaN;
}

/** Inclusive range test. Unbounded ⇒ true; unparseable/out-of-range ⇒ false. */
export function withinIsoRange(
  value: unknown,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  const t = toMillis(value);
  if (Number.isNaN(t)) return false;
  if (from) {
    const f = Date.parse(from);
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (to) {
    const e = Date.parse(to);
    if (!Number.isNaN(e) && t > e) return false;
  }
  return true;
}

/** Filter a list by a date accessor; same-array fast path when unbounded. */
export function filterByDateWindow<T>(
  items: T[],
  getDate: (item: T) => unknown,
  from?: string,
  to?: string,
): T[] {
  if (!from && !to) return items;
  return items.filter((i) => withinIsoRange(getDate(i), from, to));
}
```

- [ ] **Step 4: Run to verify it passes**

Run (from `backend/`): `npx vitest run src/utils/date-window.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/date-window.ts backend/src/utils/date-window.test.ts
git commit -m "feat(dates): in-memory withinIsoRange/filterByDateWindow helper"
```

---

## Self-Review

**Spec coverage** (Workstream 3 foundation + always-visible range):
- ISO `from`/`to` contract → Task 1 (`rangeToParams`) + Task 4 (`dateRangeQuery`). ✓
- In-memory window filtering, no indexes → Task 5 (`filterByDateWindow`). ✓
- Always-visible active range → Task 2 (`rangeLabel`) + Task 3 (`ActiveRangeBadge`). ✓
- Range carried into export filenames → Task 2 (`rangeSlug`). ✓
- Firestore `Timestamp` fields (projects/notifications/tickets) → Task 5 `toMillis` duck-typing. ✓

**Type consistency:** `rangeToParams` returns `{ from?, to? }`; `dateRangeQuery`/`DateRangeParams` use the same `from?`/`to?` names; `withinIsoRange(value, from?, to?)` and `filterByDateWindow(items, getDate, from?, to?)` share the `from?`/`to?` ordering. `rangeLabel`/`rangeSlug`/`ActiveRangeBadge` all consume `DateRange`.

**Placeholder scan:** none — every step has concrete code and exact commands.

**Note for Plan 3 (rollout):** each surface task will (a) `.merge(dateRangeQuery)` into its query schema, (b) `filterByDateWindow(rows, getDate, from, to)` in the service, (c) send `rangeToParams(range)` from the page and include it in the fetch deps, (d) drop the redundant client-side `filterByDate`, (e) render `<ActiveRangeBadge range={range} />` by the title and use `rangeSlug` in any export filename — so charts/KPIs/tables/exports share the one backend-filtered dataset.
