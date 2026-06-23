import { FieldValue } from "firebase-admin/firestore";

import { db } from "../config/firebase";
import { formatCode, parseCode, type CodeEntity } from "./code-format";

/**
 * Human-readable, sequential codes for the entities users reference (so the UI
 * never has to surface a raw Firestore id): expenses → EXP-0001, projects →
 * PRJ-001, tasks → TSK-001.
 *
 * Sequence numbers are allocated atomically from a `counters/{entity}` document
 * via a Firestore transaction (mirrors the runTransaction pattern in
 * expenseAnalysis.service), so concurrent creates never collide. The pure
 * format/parse helpers live in code-format.ts.
 */

const COUNTERS_COLLECTION = "counters";

export { formatCode, parseCode, type CodeEntity } from "./code-format";

/** Atomically allocate the next sequence number for an entity. */
export async function nextSequence(entity: CodeEntity): Promise<number> {
  const ref = db.collection(COUNTERS_COLLECTION).doc(entity);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? (snap.data()?.value as number | undefined) : 0) ?? 0;
    const next = current + 1;
    tx.set(ref, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
}

/** Allocate and format the next display code for an entity. */
export async function generateCode(entity: CodeEntity): Promise<string> {
  return formatCode(entity, await nextSequence(entity));
}

/**
 * Bump a counter so it is at least `value`. Used by the backfill to ensure new
 * codes continue after the highest backfilled number (never reusing one).
 */
export async function ensureCounterAtLeast(entity: CodeEntity, value: number): Promise<void> {
  const ref = db.collection(COUNTERS_COLLECTION).doc(entity);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? (snap.data()?.value as number | undefined) : 0) ?? 0;
    if (value > current) {
      tx.set(ref, { value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  });
}

const COLLECTION: Record<CodeEntity, string> = {
  expense: "expenses",
  project: "projects",
  task: "tasks",
  ticket: "tickets",
};

/**
 * One-time, idempotent backfill: assign codes to any existing docs that lack
 * one, in createdAt order, continuing after the highest code already present,
 * then advance the counter. Safe to re-run (already-coded docs are skipped).
 * Returns how many codes were assigned per entity.
 */
export async function backfillEntityCodes(): Promise<Record<CodeEntity, number>> {
  const assigned = { expense: 0, project: 0, task: 0 } as Record<CodeEntity, number>;

  for (const entity of ["project", "task", "expense"] as CodeEntity[]) {
    const snap = await db.collection(COLLECTION[entity]).orderBy("createdAt", "asc").get();

    let max = 0;
    const missing: typeof snap.docs = [];
    for (const doc of snap.docs) {
      const code = doc.get("code") as string | undefined;
      if (code) {
        const parsed = parseCode(code);
        if (parsed && parsed.n > max) max = parsed.n;
      } else {
        missing.push(doc);
      }
    }

    let n = max;
    let batch = db.batch();
    let ops = 0;
    for (const doc of missing) {
      n += 1;
      batch.update(doc.ref, { code: formatCode(entity, n) });
      assigned[entity] += 1;
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
    if (n > 0) await ensureCounterAtLeast(entity, n);
  }

  return assigned;
}
