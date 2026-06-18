import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import type { ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Resolve the service account credentials.
 *
 * Defaults to `<repo-root>/secrets/service-account.json`, reachable from this
 * module (backend/src/config) three levels up. Override with the
 * SERVICE_ACCOUNT_PATH env var (absolute, or relative to the working dir).
 */
const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH
  ? resolve(process.env.SERVICE_ACCOUNT_PATH)
  : resolve(__dirname, "../../../secrets/service-account.json");

const serviceAccount = JSON.parse(
  readFileSync(serviceAccountPath, "utf8"),
) as ServiceAccount & { project_id: string };

// Initialize the Admin app exactly once (guards against hot-reload re-imports).
// Expense documents default to local-disk storage (see expense-storage). When
// STORAGE_BACKEND=firebase, FIREBASE_STORAGE_BUCKET names the bucket; it's also
// set here so getStorage(app).bucket() resolves the default bucket if needed.
const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert(serviceAccount),
      ...(process.env.FIREBASE_STORAGE_BUCKET
        ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
        : {}),
    });

export const db = getFirestore(app);

export default app;
