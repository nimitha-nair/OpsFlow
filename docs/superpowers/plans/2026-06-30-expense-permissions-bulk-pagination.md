# Expenses: Capability RBAC + Admin Submit + Bulk Upload + Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any permitted role (employee, HR, admin) submit their own expenses through a real capability layer, add bulk receipt → multi-draft upload, and paginate every expense list — server-side.

**Architecture:** A new capability layer (`Capability` union + `ROLE_CAPABILITIES` map + `requirePermission` middleware) replaces hardcoded role checks on expense routes, mirrored on the frontend by a `can()` helper. Admin gets the existing employee submission flow via role-relative routing (no `/employee` hardcoding). Bulk upload creates one draft per receipt then reuses the existing per-draft AI analyze pipeline. Pagination is applied in the controller layer over the already-fetched, filtered arrays (services untouched, so reports/analytics are unaffected).

**Tech Stack:** Backend — Node, Express, TypeScript, Firestore (firebase-admin), Zod validation, Vitest. Frontend — React, React Router, Vite, TypeScript, Vitest + @testing-library/react.

## Global Constraints

- Roles are exactly `ADMIN | HR | EMPLOYEE` (`backend/src/types/roles.ts` uses `export = UserRole`; import as `import UserRole from "../types/roles"`).
- Every protected route runs `authenticate` before any permission middleware (`authenticate` populates `req.user: JwtPayload = { userId, role, ... }`).
- `createExpense` always derives `employeeId` from `req.user.userId` — never from the body. This is what makes "admin submits their own expense" correct and must not change.
- Money is never summed across currencies; do not touch the reports/aggregation path.
- Backend tests: Vitest, mock the service layer, exercise controller/middleware in isolation (see `backend/src/controllers/task.controller.test.ts` for the canonical pattern). Run with `npm --prefix backend run test`.
- Frontend tests: Vitest + @testing-library/react. Run with `npm --prefix frontend run test`.
- Pagination response shape everywhere: `{ data: T[], pagination: { page, limit, total, totalPages } }`. Defaults: `page=1`, `limit=20`, `limit` capped at 100. Reuse `pageQuery`/`limitQuery` from `backend/src/validation/common.ts`.
- Bulk upload cap: **15** files per batch (single-expense cap stays `MAX_DOCS = 5`).
- Capability strings (the single source of truth, used verbatim on both backend and frontend):
  `expense:create`, `expense:submit`, `expense:bulk-upload`, `expense:edit-own`, `expense:delete-own`, `expense:view-own`, `expense:view-all`, `expense:review`, `expense:reimburse`.
- Role → capability grants:
  - `EMPLOYEE`: create, submit, bulk-upload, edit-own, delete-own, view-own
  - `HR`: create, submit, bulk-upload, edit-own, delete-own, view-own, view-all, review
  - `ADMIN`: create, submit, bulk-upload, edit-own, delete-own, view-own, view-all, reimburse

---

## Phase 1 — Backend capability layer

### Task 1: Capability map (`permissions.ts`)

**Files:**
- Create: `backend/src/types/permissions.ts`
- Test: `backend/src/types/permissions.test.ts`

**Interfaces:**
- Produces: `type Capability` (the 9 strings above); `const ROLE_CAPABILITIES: Record<UserRole, Capability[]>`; `function hasCapability(role: string, cap: Capability): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/types/permissions.test.ts
import { describe, expect, it } from "vitest";
import UserRole from "./roles";
import { hasCapability, ROLE_CAPABILITIES } from "./permissions";

describe("capability map", () => {
  it("lets EMPLOYEE create, submit and bulk-upload", () => {
    expect(hasCapability(UserRole.EMPLOYEE, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:submit")).toBe(true);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:bulk-upload")).toBe(true);
  });

  it("does not let EMPLOYEE view-all, review or reimburse", () => {
    expect(hasCapability(UserRole.EMPLOYEE, "expense:view-all")).toBe(false);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:review")).toBe(false);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:reimburse")).toBe(false);
  });

  it("lets ADMIN create and reimburse but NOT review", () => {
    expect(hasCapability(UserRole.ADMIN, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.ADMIN, "expense:reimburse")).toBe(true);
    expect(hasCapability(UserRole.ADMIN, "expense:review")).toBe(false);
  });

  it("lets HR review and create but NOT reimburse", () => {
    expect(hasCapability(UserRole.HR, "expense:review")).toBe(true);
    expect(hasCapability(UserRole.HR, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.HR, "expense:reimburse")).toBe(false);
  });

  it("returns false for an unknown role", () => {
    expect(hasCapability("GUEST", "expense:create")).toBe(false);
  });

  it("defines capabilities for every role", () => {
    expect(Object.keys(ROLE_CAPABILITIES).sort()).toEqual(
      [UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.HR].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend run test -- permissions`
Expected: FAIL — cannot find module `./permissions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/types/permissions.ts
import UserRole from "./roles";

/**
 * Named capabilities for the expense module. Routes and UI check capabilities
 * instead of raw roles, so "who can do what" lives in one map (ROLE_CAPABILITIES)
 * rather than being scattered across route definitions.
 */
export type Capability =
  | "expense:create"
  | "expense:submit"
  | "expense:bulk-upload"
  | "expense:edit-own"
  | "expense:delete-own"
  | "expense:view-own"
  | "expense:view-all"
  | "expense:review"
  | "expense:reimburse";

const SELF_SERVICE: Capability[] = [
  "expense:create",
  "expense:submit",
  "expense:bulk-upload",
  "expense:edit-own",
  "expense:delete-own",
  "expense:view-own",
];

/** Single source of truth: which capabilities each role is granted. */
export const ROLE_CAPABILITIES: Record<UserRole, Capability[]> = {
  [UserRole.EMPLOYEE]: [...SELF_SERVICE],
  [UserRole.HR]: [...SELF_SERVICE, "expense:view-all", "expense:review"],
  [UserRole.ADMIN]: [...SELF_SERVICE, "expense:view-all", "expense:reimburse"],
};

/** Whether `role` is granted `cap`. Unknown roles have no capabilities. */
export function hasCapability(role: string, cap: Capability): boolean {
  const caps = ROLE_CAPABILITIES[role as UserRole];
  return caps ? caps.includes(cap) : false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend run test -- permissions`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/permissions.ts backend/src/types/permissions.test.ts
git commit -m "feat(expenses): add capability map (permissions.ts)"
```

---

### Task 2: `requirePermission` middleware

**Files:**
- Modify: `backend/src/middleware/rbac.middleware.ts` (add export alongside `authorize`)
- Test: `backend/src/middleware/rbac.middleware.test.ts`

**Interfaces:**
- Consumes: `hasCapability`, `Capability` from `../types/permissions`.
- Produces: `function requirePermission(...caps: Capability[]): RequestHandler` — passes if `req.user` has ANY of `caps`; 401 if unauthenticated, 403 otherwise.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/middleware/rbac.middleware.test.ts
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserRole from "../types/roles";
import { requirePermission } from "./rbac.middleware";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("requirePermission", () => {
  it("calls next() when the role has the capability", () => {
    const req = { user: { userId: "a1", role: UserRole.ADMIN } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:create")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks the capability", () => {
    const req = { user: { userId: "e1", role: UserRole.EMPLOYEE } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:reimburse")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:create")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes when the user has ANY of several capabilities", () => {
    const req = { user: { userId: "a1", role: UserRole.ADMIN } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:review", "expense:view-all")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend run test -- rbac`
Expected: FAIL — `requirePermission` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `backend/src/middleware/rbac.middleware.ts` (keep the existing `authorize` export). Add the import at the top and the function at the bottom:

```ts
import { hasCapability, type Capability } from "../types/permissions";

/**
 * Capability-based access control. Allows the request through when the
 * authenticated user's role is granted ANY of `caps`. Runs after `authenticate`.
 * - 401 if unauthenticated.
 * - 403 if the role has none of the listed capabilities.
 */
export function requirePermission(...caps: Capability[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!caps.some((cap) => hasCapability(user.role, cap))) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend run test -- rbac`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/rbac.middleware.ts backend/src/middleware/rbac.middleware.test.ts
git commit -m "feat(expenses): add requirePermission capability middleware"
```

---

### Task 3: Switch expense routes to capabilities

**Files:**
- Modify: `backend/src/routes/expense.routes.ts`

**Interfaces:**
- Consumes: `requirePermission` from `../middleware/rbac.middleware`.

No new test (route wiring is verified by Task 9's controller/integration behavior and `npm run typecheck`). This task is a mechanical guard swap.

- [ ] **Step 1: Replace the guards**

In `backend/src/routes/expense.routes.ts`:

1. Add to the rbac import (keep `authorize` import too, in case other code references it — but it is unused after this; remove `authorize` from the import if nothing else in this file uses it):
   ```ts
   import { requirePermission } from "../middleware/rbac.middleware";
   ```
   You may drop `import { authorize } from "../middleware/rbac.middleware";` and the now-unused `import UserRole from "../types/roles";` once no `authorize(...)`/`UserRole.*` remain in the file.

2. Replace each guard exactly per this table (everything else on each route — `authenticate`, `validate`, handler — stays):

   | Route | Old | New |
   |---|---|---|
   | `POST /` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:create")` |
   | `GET /my-expenses` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:view-own")` |
   | `GET /pending` | `authorize(UserRole.HR)` | `requirePermission("expense:review")` |
   | `GET /reimbursements` | `authorize(UserRole.HR, UserRole.ADMIN)` | `requirePermission("expense:view-all")` |
   | `GET /review` | `authorize(UserRole.HR, UserRole.ADMIN)` | `requirePermission("expense:view-all")` |
   | `GET /projects-spending` | `authorize(UserRole.ADMIN)` | `requirePermission("expense:view-all")` |
   | `GET /project/:projectId` | `authorize(UserRole.ADMIN)` | `requirePermission("expense:view-all")` |
   | `GET /` | `authorize(UserRole.ADMIN)` | `requirePermission("expense:view-all")` |
   | `GET /:id` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `PATCH /:id` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:edit-own")` |
   | `POST /:id/submit` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:submit")` |
   | `DELETE /:id` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:delete-own")` |
   | `POST /:id/documents` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:create")` |
   | `GET /:id/documents` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `GET /:id/documents/:docId/file` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `DELETE /:id/documents/:docId` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:edit-own")` |
   | `GET /:id/review-info` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `GET /:id/document` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `GET /:id/document/file` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `PATCH /:id/review` | `authorize(UserRole.HR)` | `requirePermission("expense:review")` |
   | `PATCH /:id/approve` | `authorize(UserRole.HR)` | `requirePermission("expense:review")` |
   | `PATCH /:id/reject` | `authorize(UserRole.HR)` | `requirePermission("expense:review")` |
   | `PATCH /:id/reimbursement` | `authorize(UserRole.ADMIN)` | `requirePermission("expense:reimburse")` |
   | `POST /:id/analyze` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:create")` |
   | `GET /:id/analysis` | `authorize(ADMIN, HR, EMPLOYEE)` | `requirePermission("expense:view-own", "expense:view-all")` |
   | `PATCH /:id/analysis` | `authorize(UserRole.EMPLOYEE)` | `requirePermission("expense:edit-own")` |

   Note: `canView()` in the controller still does the per-document ownership refinement (employee → own only; HR/ADMIN → non-draft), so granting `view-own` OR `view-all` here is correct — the controller narrows it.

- [ ] **Step 2: Typecheck**

Run: `npm --prefix backend run typecheck`
Expected: PASS (no unused-import or type errors). If `authorize`/`UserRole` are now unused in this file, remove those imports until it passes.

- [ ] **Step 3: Run the whole backend suite**

Run: `npm --prefix backend run test`
Expected: PASS (existing tests + Tasks 1–2).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/expense.routes.ts
git commit -m "feat(expenses): guard expense routes with capabilities"
```

---

## Phase 2 — Backend pagination

### Task 4: Pagination helper

**Files:**
- Create: `backend/src/utils/paginate.ts`
- Test: `backend/src/utils/paginate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Pagination { page: number; limit: number; total: number; totalPages: number }
  interface Paged<T> { data: T[]; pagination: Pagination }
  function paginate<T>(items: T[], page: number, limit: number): Paged<T>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/utils/paginate.test.ts
import { describe, expect, it } from "vitest";
import { paginate } from "./paginate";

const items = Array.from({ length: 25 }, (_, i) => i + 1);

describe("paginate", () => {
  it("returns the first page and correct totals", () => {
    const r = paginate(items, 1, 10);
    expect(r.data).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 25, totalPages: 3 });
  });

  it("returns the last (partial) page", () => {
    const r = paginate(items, 3, 10);
    expect(r.data).toEqual([21,22,23,24,25]);
    expect(r.pagination.totalPages).toBe(3);
  });

  it("returns empty data for a page past the end", () => {
    const r = paginate(items, 99, 10);
    expect(r.data).toEqual([]);
    expect(r.pagination.total).toBe(25);
  });

  it("reports 0 totalPages for an empty list", () => {
    const r = paginate([], 1, 10);
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend run test -- paginate`
Expected: FAIL — cannot find module `./paginate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/utils/paginate.ts

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  pagination: Pagination;
}

/**
 * Slice an in-memory, already-filtered array into one page. Mirrors the shape
 * used by listApprovedExpenses so every list endpoint returns the same envelope.
 */
export function paginate<T>(items: T[], page: number, limit: number): Paged<T> {
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const start = (page - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix backend run test -- paginate`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/paginate.ts backend/src/utils/paginate.test.ts
git commit -m "feat(expenses): add generic paginate helper"
```

---

### Task 5: Paginate the list endpoints (schemas + controllers)

**Files:**
- Modify: `backend/src/validation/expense.schema.ts` (add `page`/`limit`/`q` to `myExpensesQuery` and `reviewExpensesQuery`; add a new `paginatedDateRangeQuery` for pending/reimbursements)
- Modify: `backend/src/controllers/expense.controller.ts` (`getMyExpenses`, `getPendingExpenses`, `getReimbursements`, `getReviewExpenses`)
- Modify: `backend/src/routes/expense.routes.ts` (point `/pending` and `/reimbursements` validators at the new query schema)
- Test: `backend/src/controllers/expense.pagination.test.ts`

**Interfaces:**
- Consumes: `paginate` from `../utils/paginate`; existing service list functions (unchanged — they still return `Expense[]`).
- Produces: the four endpoints return `{ data, pagination }`. Query params: `page`, `limit`, optional `q` (free-text), plus the existing `from`/`to`/`basis`/`status`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/controllers/expense.pagination.test.ts
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/expense.service", () => ({
  listMyExpenses: vi.fn(),
  listExpensesByStatus: vi.fn(),
  listPendingExpenses: vi.fn(),
  listReimbursements: vi.fn(),
  listApprovedExpenses: vi.fn(),
}));
vi.mock("../services/expenseAnalysis.service", () => ({
  riskLevelsForExpenses: vi.fn(async () => new Map()),
}));
vi.mock("../services/notification.service", () => ({ notify: vi.fn() }));
vi.mock("../services/ticket.service", () => ({ getStaffIds: vi.fn() }));

import { getMyExpenses } from "./expense.controller";
import { listMyExpenses } from "../services/expense.service";

const listMyMock = vi.mocked(listMyExpenses);

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}
beforeEach(() => vi.clearAllMocks());

function fakeExpenses(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, code: `EXP-${i}`, description: i === 0 ? "taxi" : "lunch",
  }));
}

describe("getMyExpenses pagination", () => {
  it("returns a paginated envelope, 20 per page by default", async () => {
    listMyMock.mockResolvedValue(fakeExpenses(25) as never);
    const req = {
      user: { userId: "e1", role: "EMPLOYEE" },
      valid: { query: { page: 1, limit: 20 } },
    } as unknown as Request;
    const res = mockRes();

    await getMyExpenses(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.data).toHaveLength(20);
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  it("applies the free-text q filter before paginating", async () => {
    listMyMock.mockResolvedValue(fakeExpenses(25) as never);
    const req = {
      user: { userId: "e1", role: "EMPLOYEE" },
      valid: { query: { page: 1, limit: 20, q: "taxi" } },
    } as unknown as Request;
    const res = mockRes();

    await getMyExpenses(req, res);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend run test -- expense.pagination`
Expected: FAIL — `getMyExpenses` returns `{ data }` with 25 items / no `pagination`.

- [ ] **Step 3: Implement — schemas**

In `backend/src/validation/expense.schema.ts`:

1. Ensure `pageQuery`, `limitQuery`, and `optionalSearch` are imported from `./common` (add `optionalSearch` to the existing import list).
2. Replace `myExpensesQuery` and `reviewExpensesQuery`, and add `paginatedDateRangeQuery`:

```ts
/** GET /expenses/my-expenses (EMPLOYEE/any) — date window + paging + search. */
export const myExpensesQuery = z
  .object({
    basis: z.enum(["expenseDate", "submittedAt"]).optional(),
    page: pageQuery,
    limit: limitQuery,
    q: optionalSearch,
  })
  .merge(dateRangeQuery);

/** GET /expenses/review (HR/ADMIN) — status + date window + paging + search. */
export const reviewExpensesQuery = z
  .object({
    status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).optional(),
    basis: z.enum(["expenseDate", "submittedAt"]).optional(),
    page: pageQuery,
    limit: limitQuery,
    q: optionalSearch,
  })
  .merge(dateRangeQuery);

/** Pending + reimbursements lists — date window + paging + search. */
export const paginatedDateRangeQuery = z
  .object({ page: pageQuery, limit: limitQuery, q: optionalSearch })
  .merge(dateRangeQuery);
```

3. In `backend/src/routes/expense.routes.ts`, change the `/pending` and `/reimbursements` validators from `validate({ query: dateRangeQuery })` to `validate({ query: paginatedDateRangeQuery })`, and import `paginatedDateRangeQuery` from the schema module.

- [ ] **Step 4: Implement — controllers**

In `backend/src/controllers/expense.controller.ts`, add the import and a small search helper near the top:

```ts
import { paginate } from "../utils/paginate";
import type { Expense } from "../types/expense.types";

/** Case-insensitive match across the user-visible text fields of an expense. */
function matchesQuery(e: Expense, q?: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [e.code, e.description, e.category, e.currency, String(e.amount ?? "")]
    .some((v) => (v ?? "").toString().toLowerCase().includes(needle));
}
```

Then rewrite the four handlers to read `page`/`limit`/`q`, filter by `q`, and paginate. Replace each handler body's tail (`return res.status(200).json({ data })`) accordingly:

```ts
// getMyExpenses — after `const data = await listMyExpenses(...)`:
const { page, limit, q } = req.valid?.query as { page: number; limit: number; q?: string };
const filtered = data.filter((e) => matchesQuery(e, q));
return res.status(200).json(paginate(filtered, page, limit));
```

```ts
// getPendingExpenses — after `const data = await listPendingExpenses(from, to)`:
const { page, limit, q } = req.valid?.query as { page: number; limit: number; q?: string };
return res.status(200).json(paginate(data.filter((e) => matchesQuery(e, q)), page, limit));
```

```ts
// getReimbursements — after `const data = await listReimbursements(from, to)`:
const { page, limit, q } = req.valid?.query as { page: number; limit: number; q?: string };
return res.status(200).json(paginate(data.filter((e) => matchesQuery(e, q)), page, limit));
```

For `getReviewExpenses`, filter first, then attach risk only to the page slice (cheaper), then build the envelope manually so `riskLevel` survives:

```ts
// getReviewExpenses — replace the body after listExpensesByStatus(...):
const { page, limit, q } = req.valid?.query as { page: number; limit: number; q?: string };
const filtered = data.filter((e) => matchesQuery(e, q));
const pageResult = paginate(filtered, page, limit);
const risks = await riskLevelsForExpenses(pageResult.data.map((e) => e.id));
const withRisk = pageResult.data.map((e) => {
  const riskLevel = risks.get(e.id);
  return riskLevel ? { ...e, riskLevel } : e;
});
return res.status(200).json({ data: withRisk, pagination: pageResult.pagination });
```

Note: extend each handler's existing inline query-type cast to include `page`, `limit`, `q` so TypeScript is satisfied.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix backend run test -- expense.pagination`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck + full suite**

Run: `npm --prefix backend run typecheck && npm --prefix backend run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/validation/expense.schema.ts backend/src/controllers/expense.controller.ts backend/src/routes/expense.routes.ts backend/src/controllers/expense.pagination.test.ts
git commit -m "feat(expenses): server-side pagination + search on all expense lists"
```

---

## Phase 3 — Backend bulk upload

### Task 6: Bulk multer parser

**Files:**
- Modify: `backend/src/middleware/upload.ts` (add `MAX_BULK_DOCS` + `uploadReceiptsBulk`)

**Interfaces:**
- Produces: `const MAX_BULK_DOCS = 15`; `function uploadReceiptsBulk(req, res, next)` — parses a `files` field (up to 15) into `req.uploaded: Express.Multer.File[]`.

- [ ] **Step 1: Add the bulk parser** (no separate unit test — multipart middleware is covered by Task 7's controller test via mock). Append to `upload.ts`:

```ts
/** Maximum receipts in one bulk batch (each becomes its own draft expense). */
export const MAX_BULK_DOCS = 15;

const multerBulk = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_BULK_DOCS },
  fileFilter,
}).fields([{ name: "files", maxCount: MAX_BULK_DOCS }]);

/**
 * Parse up to MAX_BULK_DOCS multipart files for the bulk-draft flow. Mirrors
 * uploadReceipts but with the higher batch cap; merges into req.uploaded.
 */
export function uploadReceiptsBulk(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  multerBulk(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "File too large (max 5 MB)" });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({ error: `Too many files (max ${MAX_BULK_DOCS})` });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "Invalid upload" });
      return;
    }
    const grouped = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    (req as Request & { uploaded?: Express.Multer.File[] }).uploaded = [
      ...(grouped.files ?? []),
    ];
    next();
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix backend run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/middleware/upload.ts
git commit -m "feat(expenses): add bulk (15-file) multer parser"
```

---

### Task 7: Bulk-drafts controller + route + service helper

**Files:**
- Create: `backend/src/services/expense.bulk.ts` (orchestration helper)
- Modify: `backend/src/controllers/expense.controller.ts` (add `postBulkDrafts`)
- Modify: `backend/src/routes/expense.routes.ts` (register `POST /bulk-drafts`)
- Test: `backend/src/services/expense.bulk.test.ts`

**Interfaces:**
- Consumes: `createExpense`, `addExpenseDocumentId` (`expense.service`), `saveExpenseDocument` (`expense-document.service`).
- Produces:
  ```ts
  interface BulkDraftFile { filename: string; originalname: string; mimetype: string; size: number }
  interface BulkDraftInput { employeeId: string; scope: ExpenseScope; projectId?: string; currency: string }
  function createBulkDrafts(input: BulkDraftInput, files: BulkDraftFile[]):
    Promise<{ created: Expense[]; failed: { fileName: string; error: string }[] }>
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/expense.bulk.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./expense.service", () => ({
  createExpense: vi.fn(),
  addExpenseDocumentId: vi.fn(),
}));
vi.mock("./expense-document.service", () => ({
  saveExpenseDocument: vi.fn(),
}));

import { createBulkDrafts } from "./expense.bulk";
import { createExpense, addExpenseDocumentId } from "./expense.service";
import { saveExpenseDocument } from "./expense-document.service";

const createExpenseMock = vi.mocked(createExpense);
const saveDocMock = vi.mocked(saveExpenseDocument);
const addDocIdMock = vi.mocked(addExpenseDocumentId);

beforeEach(() => {
  vi.clearAllMocks();
  createExpenseMock.mockImplementation(async () => ({ id: "exp1" }) as never);
  saveDocMock.mockImplementation(async () => ({ id: "doc1" }) as never);
  addDocIdMock.mockResolvedValue(undefined as never);
});

const files = [
  { filename: "a.jpg", originalname: "a.jpg", mimetype: "image/jpeg", size: 10 },
  { filename: "b.jpg", originalname: "b.jpg", mimetype: "image/jpeg", size: 20 },
];

describe("createBulkDrafts", () => {
  it("creates one DRAFT expense per file and attaches the file", async () => {
    const r = await createBulkDrafts(
      { employeeId: "e1", scope: "GENERAL", currency: "INR" }, files,
    );
    expect(createExpenseMock).toHaveBeenCalledTimes(2);
    expect(createExpenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "e1", isDraft: true, type: "DOCUMENT" }),
    );
    expect(saveDocMock).toHaveBeenCalledTimes(2);
    expect(addDocIdMock).toHaveBeenCalledTimes(2);
    expect(r.created).toHaveLength(2);
    expect(r.failed).toHaveLength(0);
  });

  it("isolates a per-file failure without aborting the batch", async () => {
    createExpenseMock
      .mockImplementationOnce(async () => ({ id: "exp1" }) as never)
      .mockImplementationOnce(async () => { throw new Error("boom"); });
    const r = await createBulkDrafts(
      { employeeId: "e1", scope: "GENERAL", currency: "INR" }, files,
    );
    expect(r.created).toHaveLength(1);
    expect(r.failed).toEqual([{ fileName: "b.jpg", error: "boom" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix backend run test -- expense.bulk`
Expected: FAIL — cannot find module `./expense.bulk`.

- [ ] **Step 3: Write the service helper**

```ts
// backend/src/services/expense.bulk.ts
import type { Expense, ExpenseScope } from "../types/expense.types";
import { addExpenseDocumentId, createExpense } from "./expense.service";
import { saveExpenseDocument } from "./expense-document.service";

export interface BulkDraftFile {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface BulkDraftInput {
  employeeId: string;
  scope: ExpenseScope;
  projectId?: string;
  currency: string;
}

export interface BulkDraftResult {
  created: Expense[];
  failed: { fileName: string; error: string }[];
}

/**
 * Create one DRAFT expense per uploaded receipt and attach that receipt to it.
 * Each file is independent: a failure on one file is recorded and the rest still
 * proceed. Amount/category/date are left as draft placeholders — the per-draft
 * AI analyze + verify step fills them in, exactly like the single-receipt flow.
 */
export async function createBulkDrafts(
  input: BulkDraftInput,
  files: BulkDraftFile[],
): Promise<BulkDraftResult> {
  const created: Expense[] = [];
  const failed: { fileName: string; error: string }[] = [];

  for (const file of files) {
    try {
      const expense = await createExpense({
        employeeId: input.employeeId,
        scope: input.scope,
        projectId: input.projectId,
        type: "DOCUMENT",
        currency: input.currency,
        isDraft: true,
      });
      const view = await saveExpenseDocument({
        expenseId: expense.id,
        uploadedBy: input.employeeId,
        fileName: file.filename,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      });
      await addExpenseDocumentId(expense.id, view.id);
      created.push(expense);
    } catch (err) {
      failed.push({
        fileName: file.originalname,
        error: err instanceof Error ? err.message : "Failed to create draft",
      });
    }
  }

  return { created, failed };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix backend run test -- expense.bulk`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the controller handler**

In `backend/src/controllers/expense.controller.ts` add the imports and handler:

```ts
import { createBulkDrafts } from "../services/expense.bulk";

/**
 * POST /expenses/bulk-drafts — create one DRAFT expense per uploaded receipt.
 * The client then runs AI analyze per draft and reviews/submits each.
 */
export async function postBulkDrafts(
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
    if (uploaded.length === 0) {
      return res.status(400).json({ error: "At least one file is required" });
    }
    const body = (req.valid?.body ?? {}) as {
      scope?: "PROJECT" | "GENERAL";
      projectId?: string;
      currency?: string;
    };
    const result = await createBulkDrafts(
      {
        employeeId: req.user.userId,
        scope: body.scope ?? "GENERAL",
        projectId: body.projectId,
        currency: body.currency ?? "INR",
      },
      uploaded.map((f) => ({
        filename: f.filename,
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      })),
    );
    return res.status(201).json(result);
  } catch (err) {
    await Promise.all(uploaded.map(discardUpload));
    return handleError(res, err);
  }
}
```

- [ ] **Step 6: Register the route + validation**

In `backend/src/validation/expense.schema.ts` add:

```ts
/** POST /expenses/bulk-drafts — batch metadata (files come via multipart). */
export const bulkDraftsBody = z
  .object({
    scope: scopeSchema.default("GENERAL"),
    projectId: firestoreId.optional(),
    currency: z.string().trim().min(1).max(8).default("INR"),
  })
  .strict();
```

In `backend/src/routes/expense.routes.ts`, register BEFORE the `/:id` routes (literal path), importing `postBulkDrafts`, `uploadReceiptsBulk`, and `bulkDraftsBody`:

```ts
// EMPLOYEE / HR / ADMIN — bulk upload many receipts → many draft expenses.
router.post(
  "/bulk-drafts",
  authenticate,
  requirePermission("expense:bulk-upload"),
  uploadReceiptsBulk,
  validate({ body: bulkDraftsBody }),
  postBulkDrafts,
);
```

Note: `uploadReceiptsBulk` runs before `validate` so multipart text fields are parsed into `req.body` first.

- [ ] **Step 7: Typecheck + full suite**

Run: `npm --prefix backend run typecheck && npm --prefix backend run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/expense.bulk.ts backend/src/services/expense.bulk.test.ts backend/src/controllers/expense.controller.ts backend/src/routes/expense.routes.ts backend/src/validation/expense.schema.ts
git commit -m "feat(expenses): POST /bulk-drafts — N receipts to N draft expenses"
```

---

## Phase 4 — Frontend capability layer + admin submit

### Task 8: Frontend capability helper

**Files:**
- Create: `frontend/src/lib/permissions.ts`
- Test: `frontend/src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `Role` from `frontend/src/types/auth.ts` (union `"ADMIN" | "HR" | "EMPLOYEE"`).
- Produces: same `Capability` strings as backend; `function can(role: Role | undefined, cap: Capability): boolean`; `function expensesBasePath(role: Role): string` returning `/employee/expenses`, `/hr/expenses`, or `/admin/expenses`.

- [ ] **Step 1: Read `frontend/src/types/auth.ts`** to confirm the exact `Role` export and `roleHome` signature before writing (do not assume — confirm the import path/casing).

- [ ] **Step 2: Write the failing test**

```ts
// frontend/src/lib/permissions.test.ts
import { describe, expect, it } from "vitest";
import { can, expensesBasePath } from "./permissions";

describe("can()", () => {
  it("lets ADMIN create and bulk-upload", () => {
    expect(can("ADMIN", "expense:create")).toBe(true);
    expect(can("ADMIN", "expense:bulk-upload")).toBe(true);
  });
  it("does not let EMPLOYEE reimburse or review", () => {
    expect(can("EMPLOYEE", "expense:reimburse")).toBe(false);
    expect(can("EMPLOYEE", "expense:review")).toBe(false);
  });
  it("lets HR review and create", () => {
    expect(can("HR", "expense:review")).toBe(true);
    expect(can("HR", "expense:create")).toBe(true);
  });
  it("returns false for an undefined role", () => {
    expect(can(undefined, "expense:create")).toBe(false);
  });
});

describe("expensesBasePath()", () => {
  it("maps each role to its expenses route base", () => {
    expect(expensesBasePath("EMPLOYEE")).toBe("/employee/expenses");
    expect(expensesBasePath("HR")).toBe("/hr/expenses");
    expect(expensesBasePath("ADMIN")).toBe("/admin/expenses");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix frontend run test -- permissions`
Expected: FAIL — cannot find module `./permissions`.

- [ ] **Step 4: Write the implementation** (mirror the backend grants exactly)

```ts
// frontend/src/lib/permissions.ts
import type { Role } from "../types/auth";

export type Capability =
  | "expense:create"
  | "expense:submit"
  | "expense:bulk-upload"
  | "expense:edit-own"
  | "expense:delete-own"
  | "expense:view-own"
  | "expense:view-all"
  | "expense:review"
  | "expense:reimburse";

const SELF_SERVICE: Capability[] = [
  "expense:create",
  "expense:submit",
  "expense:bulk-upload",
  "expense:edit-own",
  "expense:delete-own",
  "expense:view-own",
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  EMPLOYEE: [...SELF_SERVICE],
  HR: [...SELF_SERVICE, "expense:view-all", "expense:review"],
  ADMIN: [...SELF_SERVICE, "expense:view-all", "expense:reimburse"],
};

/** Whether `role` is granted `cap`. Mirrors the backend ROLE_CAPABILITIES. */
export function can(role: Role | undefined, cap: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role]?.includes(cap) ?? false;
}

/** The route base for a role's own expenses (submission flow lives under this). */
export function expensesBasePath(role: Role): string {
  if (role === "ADMIN") return "/admin/expenses";
  if (role === "HR") return "/hr/expenses";
  return "/employee/expenses";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix frontend run test -- permissions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/permissions.ts frontend/src/lib/permissions.test.ts
git commit -m "feat(expenses): frontend capability helper (can/expensesBasePath)"
```

---

### Task 9: Role-relative submission routing + admin entry points

**Files:**
- Modify: `frontend/src/pages/expenses/SubmitExpensePage.tsx`, `AnalysisReviewPage.tsx`, `ExpenseVerificationPage.tsx` (replace hardcoded `/employee/expenses...` navigation with `expensesBasePath(user.role)`)
- Modify: `frontend/src/pages/expenses/MyExpensesPage.tsx` (its "Submit Expense" link → role-relative)
- Modify: `frontend/src/App.tsx` (register the submission + bulk routes under the ADMIN and HR route trees, not only EMPLOYEE)
- Modify: `frontend/src/pages/expenses/ExpensesOverviewPage.tsx` (add capability-gated "Submit Expense" + "Bulk Upload" buttons)

**Interfaces:**
- Consumes: `can`, `expensesBasePath` (Task 8); `useAuth()` for the current `user.role`.

- [ ] **Step 1: Read the affected files first.** Read `frontend/src/App.tsx` (the three route trees), `SubmitExpensePage.tsx`, `AnalysisReviewPage.tsx`, `ExpenseVerificationPage.tsx`, `MyExpensesPage.tsx`, `ExpensesOverviewPage.tsx`. Note every hardcoded `/employee/expenses...` string and every `navigate("/employee/...")`.

- [ ] **Step 2: Make navigation role-relative.** In each submission-flow page, get `const { user } = useAuth();` and `const base = expensesBasePath(user.role);` then replace literal navigation targets:
  - `navigate(\`/employee/expenses/${id}/analysis?analyze=1\`)` → `navigate(\`${base}/${id}/analysis?analyze=1\`)`
  - `Link to="/employee/expenses/new"` → `` Link to={`${base}/new`} ``
  - Apply the same substitution to every `/employee/expenses...` target in these files. Leave non-expense routes untouched.

- [ ] **Step 3: Register the routes under ADMIN and HR trees in `App.tsx`.** The EMPLOYEE tree already contains:
  ```tsx
  <Route path="expenses/new" element={<SubmitExpensePage />} />
  <Route path="expenses/:id/edit" element={<SubmitExpensePage />} />
  <Route path="expenses/:id/analysis" element={<AnalysisReviewPage />} />
  <Route path="expenses/:id/verify" element={<ExpenseVerificationPage />} />
  <Route path="expenses/bulk" element={<BulkUploadPage />} />   {/* added in Task 10 */}
  ```
  Add the same five child routes inside the `allowedRoles={["ADMIN"]}` tree (under the `/admin` parent) and the `allowedRoles={["HR"]}` tree (under `/hr`). Import the page components at the top of `App.tsx` if not already imported. (BulkUploadPage route is added in Task 10; you may add its `<Route>` now and the import in Task 10, or defer this one line to Task 10 — keep the build green either way.)

- [ ] **Step 4: Add capability-gated entry points on the admin overview.** In `ExpensesOverviewPage.tsx`, near the existing actions area (Export CSV / Project Spending), add:
  ```tsx
  import { Link } from "react-router-dom";
  import { useAuth } from "../../context/auth-context";
  import { can, expensesBasePath } from "../../lib/permissions";
  // ...inside the component:
  const { user } = useAuth();
  const base = expensesBasePath(user.role);
  // ...in the actions JSX:
  {can(user.role, "expense:create") && (
    <Link to={`${base}/new`} className="<match the page's primary-button classes>">
      Submit Expense
    </Link>
  )}
  {can(user.role, "expense:bulk-upload") && (
    <Link to={`${base}/bulk`} className="<match the page's secondary-button classes>">
      Bulk Upload
    </Link>
  )}
  ```
  Match the existing button styling on that page (copy the className from the Export CSV control). Do the same gating on `MyExpensesPage.tsx`'s existing Submit button (wrap it in `can(user.role,'expense:create')`) and add a "Bulk Upload" link next to it gated by `can(user.role,'expense:bulk-upload')`.

- [ ] **Step 5: Typecheck + build**

Run: `npm --prefix frontend run build`
Expected: PASS (tsc -b + vite build succeed).

- [ ] **Step 6: Manual verification**

Log in as ADMIN, go to `/admin/expenses`, confirm "Submit Expense" and "Bulk Upload" appear; click Submit Expense → the AI-first flow loads under `/admin/expenses/new`; create a draft, verify, submit; confirm it lands in HR's pending queue. Then confirm an EMPLOYEE still sees and uses the flow as before.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/expenses/SubmitExpensePage.tsx frontend/src/pages/expenses/AnalysisReviewPage.tsx frontend/src/pages/expenses/ExpenseVerificationPage.tsx frontend/src/pages/expenses/MyExpensesPage.tsx frontend/src/pages/expenses/ExpensesOverviewPage.tsx frontend/src/App.tsx
git commit -m "feat(expenses): admin/HR can submit own expenses (role-relative routing)"
```

---

## Phase 5 — Frontend bulk upload page

### Task 10: Bulk upload page + API client

**Files:**
- Modify: `frontend/src/lib/api/expenses-api.ts` (add `bulkCreateDrafts`)
- Create: `frontend/src/pages/expenses/BulkUploadPage.tsx`
- Modify: `frontend/src/App.tsx` (ensure `expenses/bulk` route + import exist in all three trees)

**Interfaces:**
- Consumes: existing API helpers (`analyzeExpense`/`postAnalyze` equivalent, `getAnalysis`) and the auth token plumbing already used by `uploadExpenseDocuments`.
- Produces: `bulkCreateDrafts(files: File[], opts: { scope: "PROJECT"|"GENERAL"; projectId?: string; currency?: string }): Promise<{ created: Expense[]; failed: { fileName: string; error: string }[] }>`.

- [ ] **Step 1: Read `frontend/src/lib/api/expenses-api.ts`** to copy the exact FormData/upload pattern from `uploadExpenseDocuments` (base URL, headers, auth token, error handling) and the analyze/getAnalysis function names.

- [ ] **Step 2: Add the API client function** (mirror `uploadExpenseDocuments`, posting to `/expenses/bulk-drafts` with each file appended as `files`):

```ts
export async function bulkCreateDrafts(
  files: File[],
  opts: { scope: "PROJECT" | "GENERAL"; projectId?: string; currency?: string },
): Promise<{ created: Expense[]; failed: { fileName: string; error: string }[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  form.append("scope", opts.scope);
  if (opts.projectId) form.append("projectId", opts.projectId);
  form.append("currency", opts.currency ?? "INR");
  // Use the SAME request helper/headers/auth as uploadExpenseDocuments:
  return apiPostForm("/expenses/bulk-drafts", form); // <- match the file's actual helper name
}
```

- [ ] **Step 3: Build `BulkUploadPage.tsx`.** Behavior:
  1. Reuse `ReceiptDropzone` (accepts `File[]`) + `ScopeSelector` (scope/project), capped at 15 files (show a message if more are dropped).
  2. On "Upload & Analyze": call `bulkCreateDrafts(files, { scope, projectId })`. Render a per-file row list with status: `queued → analyzing → ready / failed`. Show any `failed` entries returned by the server immediately as `failed`.
  3. For each `created` draft, run the existing per-draft analyze call with a concurrency limit of 3 (simple pool: process the array in chunks of 3 with `Promise.all`). Update each row's status as its analyze resolves/rejects.
  4. When done, show a summary ("12 ready, 1 failed") with a "Review drafts" button linking to `${expensesBasePath(user.role)}` (My Expenses, where drafts are listed and each can be opened/verified/submitted). Failed items remain editable drafts the user can open individually.
  5. Use `useAuth()` + `expensesBasePath(user.role)` for all links (role-relative).

  Keep the file focused: dropzone + a `BulkRow` sub-list + the orchestration hook. Match the visual style of `SubmitExpensePage.tsx` (cards, spacing, button classes).

- [ ] **Step 4: Wire the route.** In `App.tsx`, ensure `import BulkUploadPage from "./pages/expenses/BulkUploadPage"` and a `<Route path="expenses/bulk" element={<BulkUploadPage />} />` exist under EMPLOYEE, HR, and ADMIN trees.

- [ ] **Step 5: Typecheck + build**

Run: `npm --prefix frontend run build`
Expected: PASS.

- [ ] **Step 6: Manual verification**

As EMPLOYEE and again as ADMIN: open `…/expenses/bulk`, drop 3 receipts, run upload+analyze, watch per-file progress, confirm 3 drafts appear in My Expenses each with extracted values to verify and submit. Drop 16 files → confirm the 15-cap message. Submit one → confirm it reaches HR pending.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api/expenses-api.ts frontend/src/pages/expenses/BulkUploadPage.tsx frontend/src/App.tsx
git commit -m "feat(expenses): bulk upload page (N receipts to N AI-analyzed drafts)"
```

---

## Phase 6 — Frontend pagination

### Task 11: Shared Pagination control

**Files:**
- Create: `frontend/src/components/Pagination.tsx`
- Test: `frontend/src/components/Pagination.test.tsx`

**Interfaces:**
- Produces: `Pagination` component with props `{ page: number; totalPages: number; onPageChange: (page: number) => void }`. Renders "Page X of Y" + Prev/Next; Prev disabled on page 1, Next disabled on the last page (or when `totalPages <= 1` the component renders nothing).

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/Pagination.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("renders nothing when there is a single page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current page and total", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText(/page 2 of 5/i)).toBeInTheDocument();
  });

  it("calls onPageChange when Next/Prev are clicked", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: /prev/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables Prev on page 1 and Next on the last page", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} onPageChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    rerender(<Pagination page={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Confirm jsdom test env.** Bulk-page tests need a DOM. Check `frontend/vite.config.ts` / `vitest.config.ts` has `test.environment: "jsdom"` and a setup file importing `@testing-library/jest-dom`. If missing, add `environment: "jsdom"` to the vitest config and create `frontend/src/test/setup.ts` with `import "@testing-library/jest-dom";`, referenced via `test.setupFiles`. (Add `jsdom` as a devDependency if it is not installed: `npm --prefix frontend i -D jsdom`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm --prefix frontend run test -- Pagination`
Expected: FAIL — cannot find module `./Pagination`.

- [ ] **Step 4: Write the component**

```tsx
// frontend/src/components/Pagination.tsx

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Compact Prev / "Page X of Y" / Next control for paginated lists. */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 py-3" aria-label="Pagination">
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Prev
      </button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="rounded border px-3 py-1 text-sm disabled:opacity-40"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --prefix frontend run test -- Pagination`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Pagination.tsx frontend/src/components/Pagination.test.tsx frontend/vite.config.ts frontend/src/test/setup.ts
git commit -m "feat(expenses): shared Pagination control"
```

---

### Task 12: Wire pagination into the four list pages + API client

**Files:**
- Modify: `frontend/src/lib/api/expenses-api.ts` (list functions accept `{ page, limit, q, from, to, basis, status }` and return `{ data, pagination }`)
- Modify: `frontend/src/pages/expenses/MyExpensesPage.tsx`, `ExpensesOverviewPage.tsx`, `PendingReviewsPage.tsx`, `ReimbursementsPage.tsx`

**Interfaces:**
- Consumes: `Pagination` (Task 11); the paginated backend endpoints (Task 5).
- Produces: each page tracks `page` state, passes it to its list call, renders rows from `response.data`, and renders `<Pagination page=… totalPages={response.pagination.totalPages} onPageChange={setPage} />`.

- [ ] **Step 1: Read the four pages + `expenses-api.ts`.** Note each page's current fetch (e.g. `ExpensesOverviewPage` calls `listReviewExpenses("ALL")`) and its client-side search/filter `useMemo`.

- [ ] **Step 2: Update the API client.** Change the list functions to send pagination/search and return the envelope. Example for the review list (apply the analogous change to `listMyExpenses`, the reimbursements call, and the pending call):

```ts
export interface PageMeta { page: number; limit: number; total: number; totalPages: number; }
export interface PagedExpenses { data: Expense[]; pagination: PageMeta; }

export async function listReviewExpenses(
  status: "PENDING" | "APPROVED" | "REJECTED" | "ALL",
  params: { page: number; limit?: number; q?: string; from?: string; to?: string; basis?: string } = { page: 1 },
): Promise<PagedExpenses> {
  const qs = new URLSearchParams({
    status,
    page: String(params.page),
    limit: String(params.limit ?? 20),
  });
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.basis) qs.set("basis", params.basis);
  return apiGet(`/expenses/review?${qs.toString()}`); // <- match the file's real GET helper
}
```

  These functions previously returned `Expense[]`; they now return `PagedExpenses`. Update every call site accordingly (the four pages below).

- [ ] **Step 3: Update each page.** For each of the four pages:
  - Add `const [page, setPage] = useState(1);` and a `const [q, setQ] = useState("")` if the page has a search box (push search to the server instead of the client-side `useMemo`).
  - Refetch when `page`/`q`/date-filters change (`useEffect` dependency list or your data hook's params).
  - Render rows from `response.data` (remove the client-side full-list `filter`/`slice`; server now filters + paginates). Keep purely-visual transforms.
  - Reset `setPage(1)` whenever `q` or a date filter changes (so you don't sit on an out-of-range page).
  - Render `<Pagination page={page} totalPages={response.pagination.totalPages} onPageChange={setPage} />` below the list/cards (and below the mobile card list too — see the table→card dual-render pattern).

- [ ] **Step 4: Typecheck + build + tests**

Run: `npm --prefix frontend run build && npm --prefix frontend run test`
Expected: PASS.

- [ ] **Step 5: Manual verification**

For each list (My Expenses as employee/admin, All Expenses as admin, Pending as HR, Reimbursements as HR/admin): confirm 20 rows/page, Prev/Next move pages, "Page X of Y" is correct, typing in search narrows server-side and resets to page 1, and date filters still work.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api/expenses-api.ts frontend/src/pages/expenses/MyExpensesPage.tsx frontend/src/pages/expenses/ExpensesOverviewPage.tsx frontend/src/pages/expenses/PendingReviewsPage.tsx frontend/src/pages/expenses/ReimbursementsPage.tsx
git commit -m "feat(expenses): page-based pagination on all expense lists"
```

---

## Final verification

- [ ] `npm --prefix backend run typecheck && npm --prefix backend run test` — all green.
- [ ] `npm --prefix frontend run build && npm --prefix frontend run test` — all green.
- [ ] Manual end-to-end: admin submits own expense → HR pending; bulk upload 3 receipts as both employee and admin → 3 AI-analyzed drafts → submit → HR pending; pagination + search work on all four lists; an EMPLOYEE hitting `PATCH /expenses/:id/reimbursement` still gets 403; an ADMIN hitting `POST /expenses` now succeeds (201).
- [ ] Run `/code-review` on the branch diff.

## Notes / known-accepted

- Admin can mark reimbursement on any approved expense, including potentially their own — unchanged from today's model (separation-of-duties on reimbursement is out of scope).
- Only the expense module migrates to capabilities; other modules keep `authorize()`.
- Pagination is in-memory-after-fetch (consistent with the 30s read cache and Firestore free-tier). If a single collection grows beyond tens of thousands of docs, revisit with Firestore cursors.
