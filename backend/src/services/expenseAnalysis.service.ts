import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { getAiConfig } from "../config/ai";
import { ApiError } from "../utils/errors";
import {
  requireExpense,
  updateExpense,
  type UpdateExpenseInput,
} from "./expense.service";
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

/** Create or reset the analysis row to PENDING, returning the row id. */
async function upsertPending(
  expenseId: string,
  documentId: string,
): Promise<string> {
  const existing = await findDocByExpenseId(expenseId);
  if (existing) {
    await db.collection(ANALYSIS_COLLECTION).doc(existing.id).update({
      documentId,
      status: "PENDING" as AnalysisStatus,
      failureReason: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return existing.id;
  }
  const ref = await db.collection(ANALYSIS_COLLECTION).add({
    expenseId,
    documentId,
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
      const status = statusForConfidence(
        r.confidenceScore,
        cfg.confidenceThreshold,
      );
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
    // Write verified values back onto the DRAFT expense (source of truth).
    const writeBack: UpdateExpenseInput = {};
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
