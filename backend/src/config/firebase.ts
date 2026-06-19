import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import type { Credential, ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Resolve the service account credential. Two supported sources (env first, so
 * deployments — e.g. behind a Cloudflare Tunnel — need no secret file on disk):
 *
 *  1. Env vars: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *     (the private key may contain literal "\n" sequences, which are unescaped).
 *  2. A JSON key file: SERVICE_ACCOUNT_PATH, or the default
 *     `<repo-root>/secrets/service-account.json`.
 */
function resolveCredential(): Credential {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    });
  }

  const serviceAccountPath = process.env.SERVICE_ACCOUNT_PATH
    ? resolve(process.env.SERVICE_ACCOUNT_PATH)
    : resolve(__dirname, "../../../secrets/service-account.json");
  const serviceAccount = JSON.parse(
    readFileSync(serviceAccountPath, "utf8"),
  ) as ServiceAccount;
  return cert(serviceAccount);
}

// Initialize the Admin app exactly once (guards against hot-reload re-imports).
// Expense documents default to local-disk storage (see expense-storage). When
// STORAGE_BACKEND=firebase, FIREBASE_STORAGE_BUCKET names the bucket; it's also
// set here so getStorage(app).bucket() resolves the default bucket if needed.
const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: resolveCredential(),
      ...(process.env.FIREBASE_STORAGE_BUCKET
        ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
        : {}),
    });

export const db = getFirestore(app);

export default app;
