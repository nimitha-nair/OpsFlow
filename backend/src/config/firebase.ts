import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import type { ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

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

/**
 * Cloud Storage bucket name. Override with FIREBASE_STORAGE_BUCKET; otherwise
 * fall back to the project's default bucket.
 */
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET ??
  `${serviceAccount.project_id}.appspot.com`;

// Initialize the Admin app exactly once (guards against hot-reload re-imports).
const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert(serviceAccount),
      storageBucket,
    });

export const db = getFirestore(app);
export const bucket = getStorage(app).bucket();

export default app;
