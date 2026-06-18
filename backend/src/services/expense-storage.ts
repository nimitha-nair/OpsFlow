import { createReadStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getStorage } from "firebase-admin/storage";

import app from "../config/firebase";

/**
 * Storage backend for expense documents. Both backends expose the same surface so
 * everything downstream — streaming/download, deletion, and the Kimi extractor's
 * `resolveExpenseDocumentFile(...).read()` — works identically regardless of where
 * the bytes physically live.
 *
 * - `local`    — files on disk under backend/uploads/expenses (development default)
 * - `firebase` — objects in a Firebase Storage bucket (production)
 *
 * Selected via STORAGE_BACKEND (default "local").
 */

/** The backend root (this file lives in backend/src/services). */
export const BACKEND_ROOT = resolve(__dirname, "../..");
/** Absolute directory where locally-stored expense documents live. */
export const EXPENSE_UPLOAD_DIR = join(BACKEND_ROOT, "uploads", "expenses");
/** Path prefix (relative to the backend root) stored in Firestore for local files. */
const REL_UPLOAD_DIR = "uploads/expenses";
/** Object-name prefix used for Firebase Storage objects. */
const FIREBASE_PREFIX = "expenses";

export type StorageBackendKind = "local" | "firebase";

/** Which storage backend is active. Defaults to local disk. */
export function getStorageBackend(): StorageBackendKind {
  return process.env.STORAGE_BACKEND === "firebase" ? "firebase" : "local";
}

/** Firestore `filePath` for a locally-stored file (relative to the backend root). */
export function localFilePath(fileName: string): string {
  return `${REL_UPLOAD_DIR}/${fileName}`;
}

/** Firestore `filePath` (object name) for a Firebase-stored file. */
export function firebaseObjectName(fileName: string): string {
  return `${FIREBASE_PREFIX}/${fileName}`;
}

export interface ExpenseStorage {
  /**
   * Commit the file multer just wrote to EXPENSE_UPLOAD_DIR into this backend and
   * return the `filePath` to persist in Firestore. For local this is a no-op (the
   * file is already in place); for Firebase it uploads then removes the temp file.
   */
  commit(fileName: string, mimeType: string): Promise<string>;
  /** Read the whole file as a Buffer (used by the Kimi extractor). */
  read(filePath: string): Promise<Buffer>;
  /** A readable byte stream (used for view/download). */
  stream(filePath: string): NodeJS.ReadableStream;
  /** Best-effort delete of the underlying bytes. */
  remove(filePath: string): Promise<void>;
}

const localStorage: ExpenseStorage = {
  async commit(fileName) {
    // multer already wrote the file to EXPENSE_UPLOAD_DIR; just record its path.
    return localFilePath(fileName);
  },
  read(filePath) {
    return readFile(join(BACKEND_ROOT, filePath));
  },
  stream(filePath) {
    return createReadStream(join(BACKEND_ROOT, filePath));
  },
  async remove(filePath) {
    try {
      await unlink(join(BACKEND_ROOT, filePath));
    } catch {
      // Already gone — ignore.
    }
  },
};

/** Resolve the configured Storage bucket; only called by the firebase backend. */
function getBucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET;
  if (!name) {
    throw new Error(
      "FIREBASE_STORAGE_BUCKET must be set when STORAGE_BACKEND=firebase",
    );
  }
  return getStorage(app).bucket(name);
}

const firebaseStorage: ExpenseStorage = {
  async commit(fileName, mimeType) {
    const objectName = firebaseObjectName(fileName);
    const localTemp = join(EXPENSE_UPLOAD_DIR, fileName);
    await getBucket().upload(localTemp, {
      destination: objectName,
      metadata: { contentType: mimeType },
    });
    // The local temp written by multer is no longer needed once uploaded.
    try {
      await unlink(localTemp);
    } catch {
      // ignore
    }
    return objectName;
  },
  async read(filePath) {
    const [buf] = await getBucket().file(filePath).download();
    return buf;
  },
  stream(filePath) {
    return getBucket().file(filePath).createReadStream();
  },
  async remove(filePath) {
    try {
      await getBucket().file(filePath).delete({ ignoreNotFound: true });
    } catch {
      // Best-effort — ignore.
    }
  },
};

/** The active storage backend, selected from STORAGE_BACKEND. */
export function getExpenseStorage(): ExpenseStorage {
  return getStorageBackend() === "firebase" ? firebaseStorage : localStorage;
}
