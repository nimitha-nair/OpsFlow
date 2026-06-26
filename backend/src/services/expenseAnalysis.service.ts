import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { getAiConfig } from "../config/ai";
import { ApiError } from "../utils/errors";
import { invalidateCollection, CACHE_NS } from "../utils/cache";
import {
  requireExpense,
  updateExpense,
  type UpdateExpenseInput,
} from "./expense.service";
import { deriveDocumentIds } from "./expense-documents.read";
import { getExtractor } from "./ai/expense-extractor";
import { statusForConfidence, type ExtractionResult } from "./ai/extraction";
import { aggregateExtractions } from "./ai/aggregate";
import { deriveRiskLevel } from "./ai/risk";
import { runWithRetry } from "./ai/retry";
import {
  isAnalysisEditable,
  snapshotFromExtraction,
} from "./ai/analysis-audit";
import { claimWithin, type ClaimResult } from "./ai/analysis-claim";
import { mapToExpenseCategory } from "./ai/category-map";
import type {
  AnalysisStatus,
  ExpenseAnalysis,
  ExpenseAnalysisDocument,
  PerDocumentExtraction,
  RiskLevel,
  RiskReason,
} from "../types/expenseAnalysis.types";

const ANALYSIS_COLLECTION = "expenseAnalysis";
const EXPENSES_COLLECTION = "expenses";
const MAX_RETRIES = 2;

/**
 * Deterministic duplicate check: has this employee already filed another expense
 * with the SAME amount and date (the receipt's extracted date)? Far more reliable
 * than asking the model. Returns false when amount/date are unknown.
 */
async function isLikelyDuplicate(
  expenseId: string,
  employeeId: string,
  amount: number | null,
  transactionDate: string | null,
): Promise<boolean> {
  if (amount == null || !transactionDate) return false;
  const snap = await db
    .collection(EXPENSES_COLLECTION)
    .where("employeeId", "==", employeeId)
    .where("amount", "==", amount)
    .get();
  return snap.docs.some(
    (d) => d.id !== expenseId && d.get("expenseDate") === transactionDate,
  );
}

export interface UpdateAnalysisInput {
  vendorName?: string;
  amount?: number;
  transactionDate?: string;
  currency?: string;
  paymentMethod?: string;
  category?: string;
  taxInformation?: string;
  description?: string;
  projectId?: string;
  confirm?: boolean;
}

function tsIso(value?: Timestamp): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

function toView(doc: ExpenseAnalysisDocument): ExpenseAnalysis {
  const { createdAt, updatedAt, confirmedAt, ...rest } = doc;
  const view: ExpenseAnalysis = {
    ...rest,
    createdAt: tsIso(createdAt) ?? new Date(0).toISOString(),
    updatedAt: tsIso(updatedAt) ?? new Date(0).toISOString(),
  };
  // Omit confirmedAt entirely when absent (exactOptionalPropertyTypes).
  const confirmedIso = tsIso(confirmedAt);
  if (confirmedIso !== undefined) view.confirmedAt = confirmedIso;
  return view;
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
  const d = snap.docs[0]!;
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

/**
 * Map of expenseId → derived riskLevel for the given expenses. Used by the
 * STAFF-ONLY review queue to badge/sort by risk without leaking risk to
 * employees (who never hit the review endpoints).
 */
export async function riskLevelsForExpenses(
  expenseIds: string[],
): Promise<Map<string, RiskLevel>> {
  const wanted = new Set(expenseIds);
  const out = new Map<string, RiskLevel>();
  if (wanted.size === 0) return out;
  const snap = await db.collection(ANALYSIS_COLLECTION).get();
  for (const d of snap.docs) {
    const expenseId = d.get("expenseId") as string | undefined;
    const riskLevel = d.get("riskLevel") as RiskLevel | undefined;
    if (expenseId && riskLevel && wanted.has(expenseId)) {
      out.set(expenseId, riskLevel);
    }
  }
  return out;
}

/**
 * Remove any analysis tied to an expense. Called when the receipt is replaced or
 * removed: the prior extraction described a document that no longer exists, so it
 * must not linger (stale vendor/amount pointing at the old file). The expense is
 * always DRAFT/REJECTED at this point, so there is no submitted audit record to
 * preserve — the employee simply re-runs analysis against the new receipt.
 */
export async function deleteAnalysisForExpense(expenseId: string): Promise<void> {
  const existing = await findDocByExpenseId(expenseId);
  if (existing) {
    await db.collection(ANALYSIS_COLLECTION).doc(existing.id).delete();
    invalidateCollection(CACHE_NS.analysis);
  }
}

/** Create or reset the analysis row to PENDING, returning the row id. */
async function upsertPending(
  expenseId: string,
  documentId: string,
): Promise<string> {
  const provider = getAiConfig().provider;
  const existing = await findDocByExpenseId(expenseId);
  if (existing) {
    await db.collection(ANALYSIS_COLLECTION).doc(existing.id).update({
      documentId,
      provider,
      status: "PENDING" as AnalysisStatus,
      failureReason: FieldValue.delete(),
      lowConfidenceReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return existing.id;
  }
  const ref = await db.collection(ANALYSIS_COLLECTION).add({
    expenseId,
    documentId,
    provider,
    status: "PENDING" as AnalysisStatus,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
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

/**
 * Atomically claim the analysis row for a run. The read + the PROCESSING write
 * happen in one Firestore transaction, so two near-simultaneous /analyze calls
 * serialize and exactly one gets `claimed: true`; the loser observes the row is
 * already in flight and is rejected without starting a second worker.
 */
async function claimForRun(
  expenseId: string,
  documentId: string,
  provider: "mock" | "kimi",
  documentIds: string[],
): Promise<ClaimResult> {
  const col = db.collection(ANALYSIS_COLLECTION);
  const query = col.where("expenseId", "==", expenseId).limit(1);
  return db.runTransaction(async (tx) => {
    return claimWithin({
      async readByExpense() {
        const snap = await tx.get(query);
        if (snap.empty) return null;
        const d = snap.docs[0]!;
        return { id: d.id, status: d.data().status as AnalysisStatus };
      },
      async create() {
        const ref = col.doc();
        tx.set(ref, {
          expenseId,
          documentId,
          documentIds,
          provider,
          status: "PROCESSING" as AnalysisStatus,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return ref.id;
      },
      async reclaim(id) {
        tx.update(col.doc(id), {
          documentId,
          documentIds,
          provider,
          status: "PROCESSING" as AnalysisStatus,
          failureReason: FieldValue.delete(),
          lowConfidenceReason: FieldValue.delete(),
          confirmedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      },
    });
  });
}

/**
 * Background worker: extract, validate, persist terminal status. The row is
 * already PROCESSING (set atomically by claimForRun), so the worker goes straight
 * to extraction.
 */
async function runAnalysis(
  id: string,
  expenseId: string,
  documentId: string,
  documentIds: string[],
): Promise<void> {
  const cfg = getAiConfig();
  const extractor = getExtractor();
  const startedAt = Date.now();

  try {
    // Analyze EACH document separately so totals are deterministic (sum of
    // per-document amounts) and a per-document breakdown is available. A multi-page
    // PDF is one document → one extraction (all its pages go to the model together).
    // Retry only transient failures (429 / 5xx / network); terminal errors
    // (malformed output, auth, unsupported document) propagate to the catch.
    const perDoc: ExtractionResult[] = [];
    for (const docId of documentIds) {
      const res = await runWithRetry(
        () => extractor.extract({ expenseId, documentId: docId, documentIds: [docId] }),
        { maxRetries: MAX_RETRIES },
      );
      perDoc.push(res);
    }
    const r = aggregateExtractions(perDoc);

    // Receipt authenticity / risk (HR-facing). Model reports visual indicators;
    // we add DUPLICATE deterministically, then derive a level.
    const expense = await requireExpense(expenseId);
    const duplicate = await isLikelyDuplicate(
      expenseId,
      expense.employeeId,
      r.amount,
      r.transactionDate,
    );
    const authenticityScore = r.authenticityScore ?? 100;
    const riskReasons: RiskReason[] = [
      ...(r.riskReasons ?? []),
      ...(duplicate ? (["DUPLICATE"] as RiskReason[]) : []),
    ];
    const riskLevel = deriveRiskLevel(authenticityScore, riskReasons);

    const documents: PerDocumentExtraction[] = documentIds.map((docId, i) => {
      const d = perDoc[i]!;
      return {
        documentId: docId,
        vendorName: d.vendorName,
        amount: d.amount,
        transactionDate: d.transactionDate,
        currency: d.currency,
        category: d.category,
        taxInformation: d.taxInformation,
        confidenceScore: d.confidenceScore,
      };
    });
    const status = statusForConfidence(r.confidenceScore, cfg.confidenceThreshold);
    await db.collection(ANALYSIS_COLLECTION).doc(id).update({
      status,
      documentIds,
      documents,
      modelVersion: cfg.nvidiaModel,
      // End-to-end extraction time + provider token usage (for AI analytics).
      processingMs: Date.now() - startedAt,
      tokensUsed: r.usage?.totalTokens ?? FieldValue.delete(),
      vendorName: r.vendorName ?? FieldValue.delete(),
      amount: r.amount ?? FieldValue.delete(),
      transactionDate: r.transactionDate ?? FieldValue.delete(),
      currency: r.currency ?? FieldValue.delete(),
      paymentMethod: r.paymentMethod ?? FieldValue.delete(),
      category: r.category ?? FieldValue.delete(),
      taxInformation: r.taxInformation ?? FieldValue.delete(),
      lowConfidenceReason: r.lowConfidenceReason ?? FieldValue.delete(),
      confidenceScore: r.confidenceScore,
      // Receipt authenticity / risk — surfaced to HR/Admin only.
      authenticityScore,
      riskLevel,
      riskReasons,
      // Immutable original AI extraction — never touched by employee edits.
      // It is the audit source for the Receipt-vs-AI-vs-corrected comparison.
      aiExtraction: snapshotFromExtraction(r),
      // A fresh run supersedes any prior confirmation.
      confirmedAt: FieldValue.delete(),
      extractedData: { rawOutput: r.rawOutput },
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Analysis failed";
    await setFailed(id, reason);
  }
}

/**
 * Trigger analysis for an expense's document. Returns immediately with the row
 * in PROCESSING (or FAILED if there is no document); the extraction runs in the
 * background and the client polls getAnalysisByExpenseId.
 *
 * Concurrency: the PROCESSING transition is claimed atomically (claimForRun), so
 * only one run can be active per expense and a duplicate request that arrives
 * while a run is in flight is rejected without starting a second worker — it just
 * gets the in-flight row back (idempotent).
 */
export async function analyzeExpense(
  expenseId: string,
  ownerId: string,
): Promise<ExpenseAnalysis> {
  const expense = await requireExpense(expenseId);
  if (expense.employeeId !== ownerId) {
    throw new ApiError(403, "You can only analyze your own expenses");
  }

  const documentIds = deriveDocumentIds(expense);
  if (documentIds.length === 0) {
    const id = await upsertPending(expenseId, "");
    await setFailed(id, "No document to analyze");
    const failed = await loadDocById(id);
    return toView(failed!);
  }
  const primary = documentIds[0]!;

  const provider = getAiConfig().provider;
  const claim = await claimForRun(expenseId, primary, provider, documentIds);

  // Only the caller that won the claim starts the worker — this is what prevents
  // concurrent worker execution. A rejected duplicate falls through and returns
  // the already-in-flight row.
  if (claim.claimed) {
    // Fire-and-forget background job (long-running Node process per AI_PIPELINE.md).
    // The .catch is mandatory: runAnalysis must never reject unhandled, or a
    // transient Firestore error could crash the whole API process.
    void runAnalysis(claim.id, expenseId, primary, documentIds).catch((err) => {
      console.error("Analysis worker crashed:", err);
    });
  }

  const row = await loadDocById(claim.id);
  return toView(row!);
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
  // Freeze the analysis once the expense leaves the editable states. Without this
  // an owner could rewrite the recorded extraction after submission/approval and
  // corrupt the audit trail. Mirrors updateExpense's DRAFT/REJECTED rule.
  if (!isAnalysisEditable(expense.approvalStatus)) {
    throw new ApiError(
      400,
      "This analysis is locked because the expense has been submitted",
    );
  }
  const doc = await findDocByExpenseId(expenseId);
  if (!doc) {
    throw new ApiError(404, "No analysis found for this expense");
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (patch.vendorName !== undefined) updates.vendorName = patch.vendorName;
  if (patch.amount !== undefined) updates.amount = patch.amount;
  if (patch.transactionDate !== undefined)
    updates.transactionDate = patch.transactionDate;
  if (patch.currency !== undefined) updates.currency = patch.currency;
  if (patch.paymentMethod !== undefined)
    updates.paymentMethod = patch.paymentMethod;
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.taxInformation !== undefined)
    updates.taxInformation = patch.taxInformation;

  if (patch.confirm) {
    updates.confirmedAt = FieldValue.serverTimestamp();
    // Write verified values back onto the expense (source of truth). updateExpense
    // permits DRAFT and REJECTED expenses, so a corrected rejected expense is also
    // supported here; it enforces owner + non-locked status.
    const writeBack: UpdateExpenseInput = {};
    const amount = patch.amount ?? doc.amount;
    const currency = patch.currency ?? doc.currency;
    const date = patch.transactionDate ?? doc.transactionDate;
    const category = mapToExpenseCategory(patch.category ?? doc.category);
    if (typeof amount === "number") writeBack.amount = amount;
    if (currency) writeBack.currency = currency;
    if (date) writeBack.expenseDate = date;
    if (category) writeBack.category = category;
    // Prefer an explicit verified description; otherwise backfill a blank one
    // from the vendor so AI-first drafts (created without a description) become
    // identifiable after confirmation.
    const explicitDescription = patch.description?.trim();
    const vendor = patch.vendorName ?? doc.vendorName;
    if (explicitDescription) {
      writeBack.description = explicitDescription;
    } else if (vendor && (!expense.description || expense.description.trim() === "")) {
      writeBack.description = vendor;
    }
    // Project allocation chosen in the verify step (PROJECT scope). updateExpense
    // validates membership + presence for PROJECT scope.
    if (patch.projectId) writeBack.projectId = patch.projectId;
    if (Object.keys(writeBack).length > 0) {
      await updateExpense(expenseId, ownerId, writeBack);
    }
  }

  await db.collection(ANALYSIS_COLLECTION).doc(doc.id).update(updates);
  invalidateCollection(CACHE_NS.analysis);
  const fresh = await loadDocById(doc.id);
  return toView(fresh!);
}
