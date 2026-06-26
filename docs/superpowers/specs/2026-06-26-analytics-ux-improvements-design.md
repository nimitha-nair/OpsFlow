# Analytics & UX Improvements — Design

**Date:** 2026-06-26
**Branch:** `feat/analytics-currency-notifications-manual`

Five semi-independent improvements delivered in one spec, sequenced commits.

## Locked decisions
- **Multi-currency:** group-by-currency reporting (no FX dependency). Default view auto-selects the dominant currency in range.
- **Manual AI Q&A:** grounded — answers only from manual content, role-scoped.
- **Delivery:** one design doc, one branch, one commit per area, in dependency order.
- **Charts:** library-free (CSS/SVG), consistent with existing `charts.tsx`.
- **Donuts added alongside** existing bars (non-destructive) except the 2-flat-bar scope split which becomes a donut.

---

## Area 5 — Multi-currency (group-by-currency)

**Problem:** `reports.aggregate.ts` sums `amount` across currencies and stamps totals `"INR"`. Expenses carry a `currency` field but nothing is currency-aware.

**Strategy: filter-then-aggregate.** Existing pure aggregates stay valid because they only ever see single-currency rows.

**Backend**
- New pure `totalsByCurrency(rows)` → `{ currency, count, amount }[]`, descending by amount.
- Reports service accepts optional `currency` param. Default = currency with the largest approved spend in range. Filters rows to that currency before existing aggregates.
- Every report response gains a `currencies: { currency, count, amount }[]` summary and an `activeCurrency` field.
- Remove hardcoded `currency: "INR"` — stamp the real active currency.

**Frontend**
- Currency segmented control (defaults to dominant) + "currencies present" strip on reports/dashboards. Collapses to a single chip in the all-INR common case.
- KPIs, charts, and `formatMoney` scoped to the active currency.
- CSV export gains a currency column (verify `expenses-csv.ts`).

**Tests:** `totalsByCurrency` ordering/rounding; default-currency selection; mixed-currency report shape.

---

## Area 1 — Donut/Pie charts

New `DonutChart({ segments, centerLabel })` in `charts.tsx`: SVG arcs with `report-palette` tones, center total, legend (value + %). Empty-state consistent with existing primitives.

**Placements (compositional data only):**
- Approval status (Approved/Pending/Rejected) — dashboards + Expenses overview
- Scope split (Project vs General) — replaces 2 flat bars
- Reimbursement status (Pending/Processing/Paid) — Reimbursements page
- AI status breakdown + provider distribution — AI Analytics tab

**Stay as bars/columns:** monthly trends (temporal), ranked category spend (8-wide ranked list).

**Tests:** segment arc geometry (offsets sum, dash arrays), percent rounding, empty input.

---

## Area 2 — Column label readability

Consolidate three duplicate `monthLabel` helpers (`ExpensesTab`, `AiAnalyticsTab`, `EmployeeReports`) + `derive.ts` into one `lib/month-format.ts`.

**Smart rules:** `"Jan"`; compact year `"Jan ’26"` only at year-change boundaries; for >12 buckets thin visible labels (every Nth) while tooltips keep full `"January 2026 · …"`. Accuracy preserved.

**Tests:** boundary-year labelling, thinning cadence, single vs multi-year ranges.

---

## Area 3 — Notifications audit

Audit end-to-end and produce `docs/superpowers/notes/notifications-audit-2026-06-26.md` verifying: record creation, list rendering, mark-read (single + all), `countUnread` badge, sound preferences, `userId` role-scoping.

**Confirmed gap:** expenses never notify. Fix: wire `notify()` into expense lifecycle — submit → reviewers/HR; approve/reject → submitter; marked-paid → submitter. Fix any concrete bugs the audit surfaces.

**Tests:** expense-notify trigger unit coverage; existing notification service tests stay green.

---

## Area 4 — User Manual + grounded AI Q&A

Keep static role cards. Extract manual content into a shared role-scoped knowledge module the backend can read.

**Backend:** `POST /api/help/ask` builds a grounded prompt (role manual text + question), calls the existing Kimi text chat, returns an answer that only uses the manual ("not covered in the manual" otherwise) plus referenced section titles.

**Frontend:** Ask box atop `HelpPage` with suggested questions, loading state, answer display. Static cards remain below.

**Tests:** grounded-prompt builder shape; route auth/role-scoping; frontend Ask box render.

---

## Sequencing
1. Multi-currency (touches aggregates everything else reads)
2. Donut charts
3. Month-label consolidation
4. Notifications audit + wiring
5. Manual AI Q&A

Each area: implement → typecheck/lint/test → commit.
