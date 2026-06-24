# Search Privacy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop client-side recent-search history and the onboarding-dismissal flag from leaking across users/roles on a shared browser, and purge already-leaked data.

**Architecture:** Move recent-search storage into a small dedicated module keyed per user (`opsflow.search.recent.<userId>`), purge the legacy shared key on read, and clear all recent-search history at the central logout/401 choke point (`clearAuth`). Scope the employee onboarding-dismissal flag per user the same way.

**Tech Stack:** React + TypeScript (Vite), Vitest + Testing Library, browser `localStorage`.

## Global Constraints

- Recent-search and onboarding storage MUST be user-scoped; never share a static key across users.
- Backend search RBAC is already correct and verified — do NOT modify backend search, routes, or result DTOs.
- Follow existing code style: small focused modules, `try/catch` around all `localStorage` access (storage may be unavailable), no new dependencies.
- Storage key prefix is exactly `opsflow.search.recent`; legacy global key is exactly `opsflow.search.recent` (no suffix).
- Run frontend tests with: `npx vitest run <path>` from `frontend/`.

---

### Task 1: Extract per-user recent-search storage module

**Files:**
- Create: `frontend/src/lib/recent-search.ts`
- Create: `frontend/src/lib/recent-search.test.ts`

**Interfaces:**
- Consumes: `SearchResult` from `frontend/src/types/search.ts`.
- Produces:
  - `RECENT_SEARCH_PREFIX: string` (= `"opsflow.search.recent"`)
  - `recentSearchKey(userId: string): string`
  - `loadRecent(userId: string): SearchResult[]` — purges the legacy global key, returns that user's history (max 6)
  - `saveRecent(userId: string, items: SearchResult[]): void`
  - `clearRecentSearches(): void` — removes the legacy global key and every `opsflow.search.recent.*` key

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/recent-search.test.ts
import { afterEach, describe, expect, it } from "vitest";
import {
  RECENT_SEARCH_PREFIX,
  clearRecentSearches,
  loadRecent,
  saveRecent,
} from "./recent-search";
import type { SearchResult } from "../types/search";

const r = (id: string): SearchResult => ({ entity: "task", id, title: `T-${id}` });

afterEach(() => localStorage.clear());

describe("recent-search storage", () => {
  it("isolates history per user", () => {
    saveRecent("u1", [r("a"), r("b")]);
    expect(loadRecent("u1").map((x) => x.id)).toEqual(["a", "b"]);
    expect(loadRecent("u2")).toEqual([]);
  });

  it("purges the legacy shared key on load", () => {
    localStorage.setItem(RECENT_SEARCH_PREFIX, JSON.stringify([r("leak")]));
    expect(loadRecent("u1")).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCH_PREFIX)).toBeNull();
  });

  it("caps stored history at 6 entries", () => {
    saveRecent("u1", [r("1"), r("2"), r("3"), r("4"), r("5"), r("6"), r("7")]);
    expect(loadRecent("u1")).toHaveLength(6);
  });

  it("clearRecentSearches removes legacy and all per-user keys", () => {
    localStorage.setItem(RECENT_SEARCH_PREFIX, "[]");
    saveRecent("u1", [r("a")]);
    saveRecent("u2", [r("b")]);
    localStorage.setItem("opsflow_theme", "dark");
    clearRecentSearches();
    expect(localStorage.getItem(RECENT_SEARCH_PREFIX)).toBeNull();
    expect(loadRecent("u1")).toEqual([]);
    expect(loadRecent("u2")).toEqual([]);
    expect(localStorage.getItem("opsflow_theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/recent-search.test.ts`
Expected: FAIL — cannot resolve `./recent-search`.

- [ ] **Step 3: Implement the module**

```ts
// frontend/src/lib/recent-search.ts
import type { SearchResult } from "../types/search";

/** Namespace for per-user recent-search history. The bare prefix (no suffix) is
 *  the legacy SHARED key that leaked across users; it is purged on read/clear. */
export const RECENT_SEARCH_PREFIX = "opsflow.search.recent";
const RECENT_MAX = 6;

export function recentSearchKey(userId: string): string {
  return `${RECENT_SEARCH_PREFIX}.${userId}`;
}

function purgeLegacy(): void {
  try {
    localStorage.removeItem(RECENT_SEARCH_PREFIX);
  } catch {
    /* ignore */
  }
}

export function loadRecent(userId: string): SearchResult[] {
  purgeLegacy();
  try {
    const raw = localStorage.getItem(recentSearchKey(userId));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? (arr as SearchResult[]).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function saveRecent(userId: string, items: SearchResult[]): void {
  try {
    localStorage.setItem(
      recentSearchKey(userId),
      JSON.stringify(items.slice(0, RECENT_MAX)),
    );
  } catch {
    /* ignore quota/availability errors */
  }
}

export function clearRecentSearches(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(RECENT_SEARCH_PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/recent-search.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/recent-search.ts frontend/src/lib/recent-search.test.ts
git commit -m "feat(search): per-user recent-search storage module with legacy purge"
```

---

### Task 2: Clear recent searches at logout / 401 (storage.ts)

**Files:**
- Modify: `frontend/src/lib/storage.ts:29-32` (clearAuth)
- Modify: `frontend/src/test/logout.test.tsx` (add assertion)

**Interfaces:**
- Consumes: `clearRecentSearches` from `frontend/src/lib/recent-search.ts` (Task 1).
- Produces: `clearAuth()` now also clears all recent-search history (it is already called by `AuthProvider.logout` and the api 401 interceptor).

- [ ] **Step 1: Extend the logout integration test (failing)**

Add to `frontend/src/test/logout.test.tsx` inside the existing
`"logs out from the UI..."` test, immediately after the existing
`opsflow_user` assertion at line 71:

```tsx
    // Recent-search history must be purged on logout (privacy).
    expect(localStorage.getItem("opsflow.search.recent.u1")).toBeNull();
```

And seed a per-user recent entry inside `seedAuth()` (after line 21):

```tsx
  localStorage.setItem(
    "opsflow.search.recent.u1",
    JSON.stringify([{ entity: "task", id: "t1", title: "Secret task" }]),
  );
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/logout.test.tsx`
Expected: FAIL — `opsflow.search.recent.u1` is still present after logout.

- [ ] **Step 3: Wire clearRecentSearches into clearAuth**

```ts
// frontend/src/lib/storage.ts
import type { AuthUser } from "../types/auth";
import { clearRecentSearches } from "./recent-search";

// Keys under which the JWT and user are persisted in localStorage.
const TOKEN_KEY = "opsflow_token";
const USER_KEY = "opsflow_user";
```

Replace the body of `clearAuth`:

```ts
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  clearRecentSearches();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/logout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/storage.ts frontend/src/test/logout.test.tsx
git commit -m "fix(search): clear recent-search history on logout and 401"
```

---

### Task 3: Use the per-user module in GlobalSearch

**Files:**
- Modify: `frontend/src/components/layout/GlobalSearch.tsx:44-62` (remove local loadRecent/saveRecent + RECENT_KEY), and call sites at lines 104, 119, 178.

**Interfaces:**
- Consumes: `loadRecent`, `saveRecent` from `frontend/src/lib/recent-search.ts` (Task 1); `user.id` from `useAuth()`.
- Produces: no new exports; behavior change only.

- [ ] **Step 1: Replace the local storage helpers with the module import**

Delete lines 44-62 (the `RECENT_KEY`, `RECENT_MAX`, `loadRecent`, `saveRecent`
block) and add an import near the other imports at the top of the file:

```tsx
import { loadRecent, saveRecent } from "@/lib/recent-search";
```

- [ ] **Step 2: Thread the user id into the call sites**

In `setPaletteOpen` (currently line ~104), guard on the user:

```tsx
    if (next) {
      if (user) setRecent(loadRecent(user.id));
    } else {
```

In the Cmd/Ctrl+K effect (currently lines ~114-124), use the user id and add it
to the dependency array:

```tsx
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        if (user) setRecent(loadRecent(user.id));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);
```

In `go` (currently line ~178) — `user` is non-null here (it is after the
`if (!user) return null` guard) — pass the id:

```tsx
    saveRecent(user.id, next);
    setRecent(next);
```

- [ ] **Step 3: Run the search + lint checks**

Run: `npx vitest run src/test/logout.test.tsx && npx tsc --noEmit`
Expected: PASS / no type errors. (Confirms imports resolve and call sites type-check.)

- [ ] **Step 4: Manual verification note**

Log in as user A, perform a search, select a result, log out, log in as user B,
press Cmd/Ctrl+K with an empty query: B sees no recent items from A. Confirm the
legacy `opsflow.search.recent` key is absent in devtools.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/GlobalSearch.tsx
git commit -m "fix(search): scope recent searches to the signed-in user"
```

---

### Task 4: Scope the employee onboarding-dismissal flag per user

**Files:**
- Modify: `frontend/src/components/onboarding/EmployeeGettingStarted.tsx:8-16,68-76`
- Create: `frontend/src/components/onboarding/EmployeeGettingStarted.test.ts`

**Interfaces:**
- Consumes: `useAuth()` for `user.id`.
- Produces: `employeeOnboardingKey(userId: string): string` (exported from the component module) = `opsflow.onboarding.employee.<userId>`.

- [ ] **Step 1: Write the failing test for the key builder + isolation**

```ts
// frontend/src/components/onboarding/EmployeeGettingStarted.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { employeeOnboardingKey } from "./EmployeeGettingStarted";

afterEach(() => localStorage.clear());

describe("employeeOnboardingKey", () => {
  it("is namespaced per user", () => {
    expect(employeeOnboardingKey("u1")).toBe("opsflow.onboarding.employee.u1");
    expect(employeeOnboardingKey("u1")).not.toBe(employeeOnboardingKey("u2"));
  });

  it("one user's dismissal does not dismiss another's", () => {
    localStorage.setItem(employeeOnboardingKey("u1"), "1");
    expect(localStorage.getItem(employeeOnboardingKey("u1"))).toBe("1");
    expect(localStorage.getItem(employeeOnboardingKey("u2"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/onboarding/EmployeeGettingStarted.test.ts`
Expected: FAIL — `employeeOnboardingKey` is not exported.

- [ ] **Step 3: Implement the per-user key**

Replace lines 1-16 of `EmployeeGettingStarted.tsx`:

```tsx
import { useEffect, useState } from "react";

import { useAuth } from "../../context/auth-context";
import { listMyExpenses } from "../../lib/expenses-api";
import { listMyTasks } from "../../lib/tasks-api";
import { listTickets } from "../../lib/tickets-api";
import { GettingStarted, type OnboardingStep } from "./GettingStarted";

export function employeeOnboardingKey(userId: string): string {
  return `opsflow.onboarding.employee.${userId}`;
}

function isDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
```

In the component body, derive the key from the user and use it:

```tsx
export function EmployeeGettingStarted() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const storageKey = user
    ? employeeOnboardingKey(user.id)
    : "opsflow.onboarding.employee";

  useEffect(() => {
    // Already dismissed — don't spend API calls fetching onboarding signals.
    if (isDismissed(storageKey)) return;
    let cancelled = false;
    // ...unchanged fetch body...
```

And pass `storageKey` (instead of the old `STORAGE_KEY`) to `<GettingStarted>`:

```tsx
    <GettingStarted
      storageKey={storageKey}
      title="Welcome to OpsFlow"
      description="A few steps to get going"
      steps={steps}
    />
```

Add `storageKey` to the effect dependency array (replace the existing `[]`):

```tsx
  }, [storageKey]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/onboarding/EmployeeGettingStarted.test.ts && npx tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/onboarding/EmployeeGettingStarted.tsx frontend/src/components/onboarding/EmployeeGettingStarted.test.ts
git commit -m "fix(onboarding): scope employee getting-started dismissal per user"
```

---

## Self-Review

**Spec coverage** (Workstream 2 of the design):
- Per-user recent searches → Task 1 + Task 3. ✓
- Purge legacy global key → Task 1 (`loadRecent`/`clearRecentSearches`). ✓
- Clear on logout/401 → Task 2 (central `clearAuth`). ✓
- User-scoped onboarding flag → Task 4. ✓
- Tests (logout clears, per-user isolation) → Tasks 1, 2, 4. ✓
- Not changing backend RBAC / DTOs → respected (frontend-only). ✓

**Type consistency:** `loadRecent(userId)` / `saveRecent(userId, items)` signatures are
identical in Tasks 1 and 3. `clearRecentSearches()` defined in Task 1, consumed in
Task 2. `employeeOnboardingKey(userId)` defined and consumed in Task 4. `SearchResult`
shape matches `frontend/src/types/search.ts`.

**Placeholder scan:** none — every step has concrete code and exact commands.
