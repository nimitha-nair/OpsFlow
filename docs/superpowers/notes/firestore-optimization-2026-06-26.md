# Firestore read efficiency & resilience

**Date:** 2026-06-26
**Trigger:** backend crashed on boot with `8 RESOURCE_EXHAUSTED: Quota exceeded` (project `opsflow-cc01b` runs on the free Spark plan — billing disabled, ~50K reads/day).

## Root cause
`server.ts` → `ensureDefaultAdmin()` makes a Firestore read on every boot; on a quota error the `catch` did `process.exit(1)`, so the whole backend went down. The analytics endpoints also read **entire collections** per request, burning the daily read quota quickly.

## What changed (implemented)

### Read reduction
- **Shared, cached datasets** (`reports.service`): one projected `expenses` scan (`getAllExpensesCached` via `.select(...)`) now feeds overview **and** expenses **and** projects **and** AI reports instead of four separate full-collection reads. Analysis rows and the projects list are cached the same way.
- **Field projection**: the expenses dataset uses `.select()` to fetch only the 9 fields the reports need (less egress).
- **In-process TTL cache** (`utils/cache.ts`): 30s TTL (`ANALYTICS_CACHE_TTL_MS`), so repeated page refreshes within the window cost **zero** Firestore reads. Promise-coalescing means concurrent identical loads (e.g. a dashboard firing overview+projects at once) share **one** read.
- **Write invalidation**: expense create/update/submit/approve/reject/pay/delete → invalidate `expenses`; project create/update/archive → `projects`; analysis update/delete → `analysis`. Analytics are never stale after a write.

### Resilience
- `server.ts` now **always** `app.listen`s; `ensureDefaultAdmin` is best-effort (logged, non-fatal) and skippable with `SKIP_ADMIN_SEED=1`. A transient DB error no longer kills the process.
- Firestore quota/unavailable/timeout (gRPC 8/14/4) → **503 + retry message** (`reports.controller` + global `app.ts` handler), never a 500 or crash.

### Observability
- `tracedGet(query, label)` (`utils/firestore.ts`) counts documents read and logs `collection · N docs · ms · total=…` when `LOG_FIRESTORE_READS=1`, so expensive scans are visible in dev.

## Recommended next steps (not yet implemented)

1. **`count()` / `sum()` aggregation queries for KPIs.** The overview KPIs only need per-status counts + summed amounts. Firestore aggregation queries bill ~1 read per 1000 index entries instead of 1 read per document — a large saving once the collection grows. Requires composite indexes `(approvalStatus)` + `(approvalStatus, amount)`.
2. **Composite indexes** (add to `firestore.indexes.json`, currently empty) for the range/sort patterns once we move filtering server-side:
   - `expenses`: `(approvalStatus ASC, expenseDate DESC)`, `(approvalStatus ASC, submittedAt DESC)`, `(employeeId ASC, createdAt DESC)`.
   - `expenseAnalysis`: `(status ASC, createdAt DESC)`.
   The reports deliberately filter in memory today to avoid needing these; revisit when data volume makes a server-side range query worthwhile.
3. **Server-side date-range queries** once indexes exist, so a "last 30 days" report reads only the windowed docs instead of the whole collection + in-memory filter.
4. **Pagination caps**: `listProjects({ limit: 100000 })` and `listReviewExpenses("ALL")` are effectively unbounded; cap and paginate for large tenants.
5. **Enable Blaze billing** to remove the hard daily quota entirely (the permanent fix; cost is negligible at this scale).
6. **`activity.service`** still scans users/tickets/tasks/expenses/projects per request — a candidate for the same shared-cache treatment.

## Tuning knobs (env)
- `ANALYTICS_CACHE_TTL_MS` (default 30000) — analytics cache freshness vs. read savings.
- `LOG_FIRESTORE_READS=1` — log every traced read in dev.
- `SKIP_ADMIN_SEED=1` — skip the startup admin read once the admin exists.
