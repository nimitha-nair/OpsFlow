/**
 * Firestore read instrumentation + quota-error helpers.
 *
 * `tracedGet` wraps a query's `.get()` so every scan reports its collection,
 * document count, and duration (gated by LOG_FIRESTORE_READS so it's quiet in
 * prod). This makes expensive full-collection scans obvious during development
 * and feeds a process-wide read counter.
 */

import type { DocumentData, Query, QuerySnapshot } from "firebase-admin/firestore";

let totalReads = 0;

/** Total documents read via tracedGet since process start. */
export function firestoreReadCount(): number {
  return totalReads;
}

const LOG_READS =
  process.env.LOG_FIRESTORE_READS === "1" ||
  process.env.LOG_FIRESTORE_READS === "true";

/**
 * Run `query.get()` while counting documents read and (optionally) logging a
 * structured line. `label` identifies the call site, e.g. "reports.expenses:all".
 */
export async function tracedGet<T = DocumentData>(
  query: Query<T>,
  label: string,
): Promise<QuerySnapshot<T>> {
  const start = Date.now();
  const snap = await query.get();
  totalReads += snap.size;
  if (LOG_READS) {
    const ms = Date.now() - start;
    console.info(
      `[firestore] ${label} · ${snap.size} doc(s) · ${ms}ms · total=${totalReads}`,
    );
  }
  return snap;
}

/**
 * True for gRPC errors that mean "Firestore is temporarily unwilling/unable to
 * serve" — quota exhaustion (8 RESOURCE_EXHAUSTED), unavailability
 * (14 UNAVAILABLE), or timeout (4 DEADLINE_EXCEEDED). These should degrade to a
 * 503 + retry message, never crash the process.
 */
export function isFirestoreQuotaError(err: unknown): boolean {
  const code = (err as { code?: number } | null)?.code;
  return code === 8 || code === 14 || code === 4;
}

/** Human-facing message for a temporarily unavailable database. */
export const FIRESTORE_UNAVAILABLE_MESSAGE =
  "The database is temporarily rate-limited or over quota. Please retry in a moment.";
