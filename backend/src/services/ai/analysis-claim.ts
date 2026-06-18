import type { AnalysisStatus } from "../../types/expenseAnalysis.types";

/** A run is in flight (claimed) while in either of these non-terminal states. */
export function isInFlight(status: AnalysisStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export type ClaimDecision =
  | { kind: "create" } // no row yet → create one and claim it
  | { kind: "reclaim"; id: string } // terminal row → reset and re-claim
  | { kind: "reject"; id: string }; // a run is already in flight → do not start another

/**
 * Decide what to do with an analyze request given the current analysis row. This
 * is the heart of the atomic guard: it MUST be evaluated inside a transaction that
 * also reads the row, so the read-decide-write is a single atomic step and no two
 * callers can both transition the row into PROCESSING.
 */
export function decideClaim(
  existing: { id: string; status: AnalysisStatus } | null,
): ClaimDecision {
  if (!existing) return { kind: "create" };
  if (isInFlight(existing.status)) return { kind: "reject", id: existing.id };
  return { kind: "reclaim", id: existing.id };
}

/** The minimal transactional surface the claim needs — backed by Firestore in prod. */
export interface ClaimTx {
  /** The single analysis row for this expense, or null. */
  readByExpense(): Promise<{ id: string; status: AnalysisStatus } | null>;
  /** Create a fresh row already claimed as PROCESSING; returns its id. */
  create(): Promise<string>;
  /** Reset an existing terminal row to PROCESSING (re-claim). */
  reclaim(id: string): Promise<void>;
}

export interface ClaimResult {
  id: string;
  /** True only for the single caller that started (or restarted) the run. */
  claimed: boolean;
}

/**
 * Apply the claim decision through the transaction surface. Run this INSIDE a
 * Firestore transaction so the read + the PROCESSING write commit atomically;
 * concurrent callers then serialize and exactly one observes `claimed: true`.
 * A rejected (already-in-flight) caller performs no write and starts no worker.
 */
export async function claimWithin(tx: ClaimTx): Promise<ClaimResult> {
  const existing = await tx.readByExpense();
  const decision = decideClaim(existing);
  switch (decision.kind) {
    case "reject":
      return { id: decision.id, claimed: false };
    case "reclaim":
      await tx.reclaim(decision.id);
      return { id: decision.id, claimed: true };
    case "create": {
      const id = await tx.create();
      return { id, claimed: true };
    }
  }
}
