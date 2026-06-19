import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { ApiError } from "../utils/errors";
import type {
  ExpenseFileDocument,
  ExpenseFileView,
} from "../types/expense.types";
import { getExpenseStorage } from "./expense-storage";

// Re-exported so the upload middleware (multer destination) keeps a single import.
export { EXPENSE_UPLOAD_DIR } from "./expense-storage";

const DOCUMENTS_COLLECTION = "expenseDocuments";

/** Allowed receipt/invoice MIME types and their file extensions. */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_TYPES);

// EXPENSE_UPLOAD_DIR lives in ./expense-storage (re-exported above). It is where
// multer writes; `getExpenseStorage().commit(...)` then commits the file to the
// active backend (local = no-op, firebase = upload + temp cleanup).

/** File extension (no dot) for an allowed MIME type, or "bin" if unknown. */
export function extForMime(mimeType: string): string {
  return ALLOWED_TYPES[mimeType] ?? "bin";
}

function tsIso(value: Timestamp): string {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : new Date(0).toISOString();
}

/** API path (relative to the API base) that streams a document's bytes. */
function fileUrl(expenseId: string): string {
  return `/expenses/${expenseId}/document/file`;
}

function toFileView(doc: ExpenseFileDocument): ExpenseFileView {
  return {
    id: doc.id,
    expenseId: doc.expenseId,
    fileName: doc.fileName,
    originalFileName: doc.originalFileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    uploadedBy: doc.uploadedBy,
    uploadedAt: tsIso(doc.uploadedAt),
    url: fileUrl(doc.expenseId),
  };
}

export interface SaveDocumentInput {
  expenseId: string;
  uploadedBy: string;
  /** Generated on-disk filename (from multer's diskStorage). */
  fileName: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Record the metadata for a file already written to disk by multer, in the
 * `expenseDocuments` collection. The file path is derived from `fileName`.
 */
export async function saveExpenseDocument(
  input: SaveDocumentInput,
): Promise<ExpenseFileView> {
  // Commit the just-uploaded file into the active backend (local disk or Firebase
  // Storage) and persist whatever path/object name that backend resolved.
  const filePath = await getExpenseStorage().commit(
    input.fileName,
    input.mimeType,
  );

  const ref = await db.collection(DOCUMENTS_COLLECTION).add({
    expenseId: input.expenseId,
    fileName: input.fileName,
    originalFileName: input.originalFileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    filePath,
    uploadedBy: input.uploadedBy,
    uploadedAt: FieldValue.serverTimestamp(),
  });

  const snap = await ref.get();
  const doc: ExpenseFileDocument = {
    id: snap.id,
    ...(snap.data() as Omit<ExpenseFileDocument, "id">),
  };
  return toFileView(doc);
}

/** All document metadata for an expense, oldest first (primary first). */
export async function listExpenseDocuments(
  expenseId: string,
): Promise<ExpenseFileView[]> {
  const snap = await db
    .collection(DOCUMENTS_COLLECTION)
    .where("expenseId", "==", expenseId)
    .orderBy("uploadedAt", "asc")
    .get();
  return snap.docs.map((d) =>
    toFileView({ id: d.id, ...(d.data() as Omit<ExpenseFileDocument, "id">) }),
  );
}

/** A document record by its id, or null if it does not exist. */
export async function getDocumentById(
  documentId: string,
): Promise<ExpenseFileDocument | null> {
  const snap = await db.collection(DOCUMENTS_COLLECTION).doc(documentId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<ExpenseFileDocument, "id">) };
}

/** Document metadata for the file linked to an expense (by documentId). */
export async function getExpenseDocumentMeta(
  documentId: string,
): Promise<ExpenseFileView> {
  const doc = await getDocumentById(documentId);
  if (!doc) {
    throw new ApiError(404, "No document attached to this expense");
  }
  return toFileView(doc);
}

export interface ResolvedFile {
  mimeType: string;
  originalFileName: string;
  /** Full file bytes — backend-agnostic (used by the Kimi extractor). */
  read: () => Promise<Buffer>;
  /** Readable byte stream — used for inline view / download. */
  stream: () => NodeJS.ReadableStream;
}

/**
 * Resolve a document to backend-agnostic byte access (local disk or Firebase
 * Storage). Callers use `read()` for bytes or `stream()` for piping.
 */
export async function resolveExpenseDocumentFile(
  documentId: string,
): Promise<ResolvedFile> {
  const doc = await getDocumentById(documentId);
  if (!doc) {
    throw new ApiError(404, "No document attached to this expense");
  }
  const storage = getExpenseStorage();
  return {
    mimeType: doc.mimeType,
    originalFileName: doc.originalFileName,
    read: () => storage.read(doc.filePath),
    stream: () => storage.stream(doc.filePath),
  };
}

/**
 * Delete a document record and its stored bytes (best-effort). Used when an
 * expense's document is being replaced so old files do not accumulate.
 */
export async function deleteExpenseDocument(documentId: string): Promise<void> {
  const doc = await getDocumentById(documentId);
  if (!doc) return;
  await getExpenseStorage().remove(doc.filePath);
  await db.collection(DOCUMENTS_COLLECTION).doc(documentId).delete();
}
