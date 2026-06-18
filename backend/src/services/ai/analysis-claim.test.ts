import { describe, expect, it } from "vitest";

import {
  claimWithin,
  decideClaim,
  isInFlight,
  type ClaimTx,
} from "./analysis-claim";
import type { AnalysisStatus } from "../../types/expenseAnalysis.types";

describe("decideClaim", () => {
  it("creates a row when none exists", () => {
    expect(decideClaim(null)).toEqual({ kind: "create" });
  });

  it("rejects when a run is already in flight", () => {
    expect(decideClaim({ id: "a1", status: "PENDING" })).toEqual({
      kind: "reject",
      id: "a1",
    });
    expect(decideClaim({ id: "a1", status: "PROCESSING" })).toEqual({
      kind: "reject",
      id: "a1",
    });
  });

  it("re-claims a terminal row", () => {
    for (const status of ["COMPLETED", "FAILED", "LOW_CONFIDENCE"] as const) {
      expect(decideClaim({ id: "a1", status })).toEqual({
        kind: "reclaim",
        id: "a1",
      });
    }
  });
});

describe("isInFlight", () => {
  it("is true only for PENDING/PROCESSING", () => {
    expect(isInFlight("PENDING")).toBe(true);
    expect(isInFlight("PROCESSING")).toBe(true);
    expect(isInFlight("COMPLETED")).toBe(false);
    expect(isInFlight("FAILED")).toBe(false);
    expect(isInFlight("LOW_CONFIDENCE")).toBe(false);
  });
});

/** In-memory store modelling the single 1:1 analysis row for one expense. */
function makeStore(initial: { id: string; status: AnalysisStatus } | null) {
  const state = {
    row: initial,
    creates: 0,
    reclaims: 0,
    nextId: 1,
  };
  const tx: ClaimTx = {
    async readByExpense() {
      return state.row ? { ...state.row } : null;
    },
    async create() {
      const id = `a${state.nextId++}`;
      state.row = { id, status: "PROCESSING" };
      state.creates += 1;
      return id;
    },
    async reclaim(id) {
      state.row = { id, status: "PROCESSING" };
      state.reclaims += 1;
    },
  };
  return { state, tx };
}

describe("claimWithin", () => {
  it("creates and claims when there is no row", async () => {
    const { state, tx } = makeStore(null);
    const res = await claimWithin(tx);
    expect(res.claimed).toBe(true);
    expect(state.creates).toBe(1);
    expect(state.row?.status).toBe("PROCESSING");
  });

  it("rejects without any write when a run is in flight", async () => {
    const { state, tx } = makeStore({ id: "a9", status: "PROCESSING" });
    const res = await claimWithin(tx);
    expect(res).toEqual({ id: "a9", claimed: false });
    expect(state.creates).toBe(0);
    expect(state.reclaims).toBe(0);
  });

  it("re-claims a terminal row", async () => {
    const { state, tx } = makeStore({ id: "a9", status: "FAILED" });
    const res = await claimWithin(tx);
    expect(res).toEqual({ id: "a9", claimed: true });
    expect(state.reclaims).toBe(1);
    expect(state.row?.status).toBe("PROCESSING");
  });
});

/**
 * Serialized transaction runner: models Firestore's guarantee that two
 * transactions reading+writing the same row cannot both commit — they serialize
 * (via retries) so each sees the other's committed effect.
 */
function serializedRunner() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const p = tail.then(fn);
    tail = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  };
}

describe("concurrent claims (atomicity)", () => {
  it("lets exactly one of many concurrent claims win, with a single row", async () => {
    const { state, tx } = makeStore(null);
    const run = serializedRunner();

    const results = await Promise.all(
      Array.from({ length: 8 }, () => run(() => claimWithin(tx))),
    );

    const winners = results.filter((r) => r.claimed);
    expect(winners).toHaveLength(1); // only one worker would be started
    expect(state.creates).toBe(1); // single row ever created
    expect(new Set(results.map((r) => r.id)).size).toBe(1); // all resolve to it
  });

  it("control: WITHOUT atomic serialization the guard fails (why the txn matters)", async () => {
    const { state, tx } = makeStore(null);

    // No serialization: every call reads the (still-null) row before any create
    // commits, so each one decides to create — the bug the transaction prevents.
    const results = await Promise.all(
      Array.from({ length: 4 }, () => claimWithin(tx)),
    );

    expect(results.filter((r) => r.claimed).length).toBeGreaterThan(1);
    expect(state.creates).toBeGreaterThan(1);
  });
});
