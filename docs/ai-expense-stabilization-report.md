# AI Expense Intelligence — Stabilization Pass (pre-Kimi)

Date: 2026-06-18 · Branch: `feat/ai-expense-intelligence` · **No Kimi integration done.**
Provider remains `mock`. Goal: make the workflow production-ready and auditable
before wiring the real Kimi (NVIDIA Build) extractor.

> Note: the implementation is **Firestore**, not the MySQL described in
> `AI_PIPELINE.md`/`DATABASE.md`. Audited against the real code.

---

## 1. Issues fixed

### From the spec
1. **Analyze without leaving the create screen.** Added **"Save & Analyze"** on
   `SubmitExpensePage`: it auto-saves the draft, uploads the receipt, and routes
   straight to `…/analysis?analyze=1`, which **auto-starts** the run on arrival —
   no save → reopen → analyze round-trip.
2. **Zoom presets + wheel zoom.** `ReceiptViewer` now exposes the exact spec
   levels **50/75/100/125/150/200/300%** (preset dropdown + snap-stepping +/−
   buttons) and **Ctrl/⌘ + mouse-wheel** zoom. (25–400% free zoom already existed
   from the prior revamp; replaced with the requested discrete set.)
3. **Fit Width + Fit Page.** Fit Width already worked; added a working **Fit Page**
   (caps each page to the viewport height) for both images and rasterized PDFs.
4. **Navigation / no dead ends.** Added **Back to expense** on the Analysis page,
   **Back to analysis** + **Back to expense** on Verify, and **unsaved edits are
   now preserved** across Verify↔Analysis (sessionStorage draft, cleared on
   submit). Verify now uses the standard `LoadingState`.
5. **HR visibility.** New read-only **AI extraction & audit panel** on the expense
   detail/review screen showing receipt + AI extraction + confidence + provider +
   model version + low-confidence reason + a **three-way comparison (AI extracted
   vs Employee corrected vs Final submitted)** with edited fields highlighted.
6. **Admin visibility.** Same panel renders for Admin (read-only), alongside the
   existing HR decision/remarks card. No approval-authority change.

### Integrity fixes discovered during the audit
7. **Analysis is now frozen after submission.** `updateAnalysis` rejects edits
   unless the expense is DRAFT/REJECTED (`isAnalysisEditable`). Previously an owner
   could rewrite the recorded extraction post-submission and corrupt the trail.
8. **Original AI extraction is preserved immutably.** The worker now writes an
   `aiExtraction` snapshot at terminal success; employee corrections live in the
   editable fields. This is what powers the HR/Admin three-way comparison.
9. **Replacing the receipt invalidates the stale analysis.** Document
   (re)upload deletes the prior analysis (`deleteAnalysisForExpense`) so it can't
   point at a removed file. A fresh run also clears any prior `confirmedAt`.
10. **Document-upload guard fixed.** Receipts are now editable exactly when the
    expense is (DRAFT/REJECTED). This **allows replacing a receipt on a rejected
    expense** (previously blocked) and **blocks swapping under review**
    (SUBMITTED/PENDING_REVIEW, previously allowed).

## 2. Additional issues discovered (recommended, not all done here)

- **Non-atomic `/analyze` guard** (documented in code): two near-simultaneous
  triggers can both start a worker. Close with a PENDING→PROCESSING transaction
  before/with Kimi.
- **No reversal path for an approved expense** (no un-approve/void). Budget
  utilization is live & correct, but a mis-approval can't be corrected.
- **`reprocess` endpoint** promised in `AI_PIPELINE.md` is not implemented
  (`/analyze` re-run covers it; doc drift).
- **Large multi-page PDFs** rasterize all pages into memory (no lazy loading).
- Fire-and-forget worker has no durable queue (acceptable for MVP).

## 3. RBAC & data integrity (verified, no change needed)

- Ownership enforced at middleware **and** service layers; employees see only
  their own expenses/analyses; DRAFTs private to owner; budget stripped from
  HR/Employee. **No leaks found.**
- Archived projects **cannot** be selected for new expenses (`assertProjectNotArchived` → 409).
- Budget utilization is computed live from APPROVED + PROJECT-scoped expenses.
- Reject→resubmit clears denormalized review fields but preserves the immutable
  `expenseApprovals` audit log.

## 4. Answers to the audit questions

- **New receipt after analysis:** old file + stale analysis are now removed; the
  employee re-runs Analyze against the new receipt.
- **HR rejects → employee edits/resubmits:** REJECTED (editable) → PENDING_REVIEW;
  approvals log preserved; receipt can now be replaced on REJECTED.
- **Repeated analysis → inconsistent records:** still 1:1 (no duplicates); the
  immutable `aiExtraction` snapshot + freeze-on-submit now keep the trail honest.
- **Archived project for new expense:** blocked (409).
- **Budget after approved edit/reversal:** live recompute; approved expenses are
  immutable and there's no reversal path (gap noted).
- **Analysis frozen after submit:** **yes, now** (was not before).

## 5. Files changed

Backend: `types/expenseAnalysis.types.ts`, `services/expenseAnalysis.service.ts`,
`services/ai/analysis-audit.ts` (+test), `controllers/expense.controller.ts`.
Frontend: `types/expenseAnalysis.ts`, `lib/viewer-zoom.ts` (+test),
`components/expenses/ReceiptViewer.tsx`, `components/expenses/AnalysisAuditPanel.tsx`
(new), `pages/expenses/{SubmitExpense,AnalysisReview,ExpenseVerification,ExpenseDetails}Page.tsx`.

## 6. Verification

- Backend: `tsc --noEmit` clean; `vitest` **32/32** (incl. new `analysis-audit` tests).
- Frontend: `tsc -b` clean; `eslint .` **0 errors**; `vite build` ✓; `vitest` **22/22**
  (incl. new zoom-preset tests).
- **Not yet exercised live:** the end-to-end receipt flow (upload → analyze →
  verify → review) needs a working Firebase **Storage bucket**, which is the
  standing billing blocker. Interactive UI verification is pending that.

## 7. Kimi-readiness recommendation

**Ready once Storage is enabled and a live mock run is exercised.** The audit
trail is now trustworthy (immutable AI snapshot, frozen post-submit, stale
analysis invalidated, HR/Admin can compare AI vs corrections vs final), so a real
model's accuracy can be measured and audited. Kimi is a contained swap behind
`getExtractor()` / `AI_PROVIDER=kimi`. Before flipping it on: close the atomic
`/analyze` guard and run one real receipt end-to-end against the live bucket.
