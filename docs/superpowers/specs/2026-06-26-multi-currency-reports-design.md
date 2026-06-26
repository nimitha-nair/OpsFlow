# Multi-currency Reports — Design

**Date:** 2026-06-26
**Branch:** `feat/analytics-currency-notifications-manual`

Make the Reports surfaces render **per selected currency** on screen, with a clean multi-select currency filter, so the PDF export mirrors the screen exactly. No conversion, no merging, no summary page.

## Locked decisions
- Currency filter is **multi-select** with **Select all** / **Clear all**.
- **Default = all currencies present** selected.
- **One currency selected → today's layout** (no headings).
- **Multiple selected → per-currency sections with a heading** (`INR`, `AED`, `EUR`), within **each tab**.
- **PDF mirrors the on-screen report** — "Export all" prints the page as-is; **no summary page**.
- **Self-fetching tabs (Expenses, Projects)** become **filter-controlled** (their own currency pickers hidden; one instance per selected currency).
- **AI Extraction tab shows once** (currency-agnostic engine metrics).
- Surfaces: **Admin Reports + HR Insights** (full) and **Employee My Reports** (its subset).

## Architecture

### 1. `CurrencyScope` → multi-select
Props become `{ totals: CurrencyTotal[]; selected: string[]; onChange(next: string[]): void }`.
- Multiple currencies present → toggle pills (selected highlighted) + **Select all** / **Clear all** buttons.
- One currency present → the existing static informational chip (no controls).
- Never allow an empty selection to blank the report: Clear All falls back to showing all (or disables when it would be empty) — empty selection renders nothing useful, so Clear All resets to the dominant currency.

### 2. `PerCurrencySections` wrapper (new, reusable)
```
PerCurrencySections({ currencies: string[], children: (currency: string) => ReactNode })
```
- `currencies.length <= 1` → render `children(currencies[0])` **bare** (current layout, no heading).
- `> 1` → render each currency as a `<section>` with a **currency heading** and `break-before: page` (except the first) + `break-inside: avoid` so sections paginate cleanly.

### 3. Per-surface state
Each surface holds `selectedCurrencies: string[]`, initialized to **all** currencies in `totalsByCurrency(records)`. A `scopedFor(currency)` helper returns the records/reimbursementRecords filtered to that currency. Because each rendered section is single-currency, the existing grouped-money components (`MoneyTotals`) naturally collapse to a single value per section.

### 4. Per-tab wiring (Admin `ReportsWorkspace`)
Each panel's content is wrapped in `PerCurrencySections` over `selectedCurrencies`, **except** AI:
- **Overview / Departments / Employees / Reimbursements / Audit** — client-derived from `records`; render the sub-component per currency with `scopedFor(c)` + `currency={c}`.
- **Expenses** — `PerCurrencySections`→ `<ExpensesTab currency={c} controlled />` (one fetch per currency; backend dataset is cached/shared so cost stays low).
- **Projects** — `PerCurrencySections`→ `<ProjectsTab currency={c} controlled />`.
- **AI Extraction** — `<AiAnalyticsTab />` once, unwrapped.

`ExpensesTab` / `ProjectsTab` gain an optional `currency` (controlled) prop: when set they use it, **hide their internal `CurrencyScope` picker**, and (to avoid N redundant toolbars) hide their per-instance month/sort toolbar, using sensible defaults. Uncontrolled usage (if any elsewhere) is unchanged.

### 5. HR Insights & Employee
- **HR Insights**: same wrapping; non-financial **Workforce** tab + **AI** show once; expense/approvals/reimbursement/compliance go per-currency.
- **Employee My Reports** (single page): wrap the KPI + category + trend + expense-detail blocks in `PerCurrencySections` over the selected currencies.

### 6. PDF / pagination
No separate print document and **no summary page**. The existing `printElement`/"Export all"/`exportPdf` print the live (now per-currency) DOM. `PerCurrencySections` provides the page breaks; cards/charts keep `break-inside: avoid`. The established print CSS (hide live app, force chart fills, light theme) already prevents blank pages and clipped charts.

## Data flow
`records` (all currencies, loaded once) → `totalsByCurrency` → `selectedCurrencies` (default all) → for each selected currency, `scopedFor(c)` filters records → existing derive/aggregate functions + chart primitives render that currency's section. Money is never summed across currencies; each section is wholly one currency.

## Testing
- `CurrencyScope` multi-select: toggling, Select all, Clear all (resets to dominant), single-currency chip.
- `PerCurrencySections`: 1 currency → no heading/bare; N → N headings + page breaks.
- Render test: a 2-currency workspace panel produces 2 currency headings; 1-currency produces today's layout.
- Existing report/aggregate tests stay green.

## Out of scope
- Currency conversion / a base "reporting currency" (separate future feature; the per-currency array is already the seam for it).
- AI extraction analytics per currency (engine metrics, not money).
