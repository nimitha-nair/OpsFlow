import { describe, expect, it, vi } from "vitest";

// expense.service pulls in config/firebase (which initializes the Admin SDK at
// import). Stub it so this stays a pure unit test of the per-currency grouping —
// summarizeProjectSpend never touches Firestore.
vi.mock("../config/firebase", () => ({ db: {} }));

import { summarizeProjectSpend } from "./expense.service";

describe("summarizeProjectSpend", () => {
  it("groups spend by currency and measures utilization in the primary currency only", () => {
    // INR is dominant (largest amount) → it becomes the primary currency.
    const rows = [
      { currency: "INR", amount: 800 },
      { currency: "INR", amount: 50 },
      { currency: "USD", amount: 600 },
    ];
    const result = summarizeProjectSpend(rows, 1000);

    // Full per-currency breakdown is kept (desc by amount), never combined.
    expect(result.spentByCurrency).toEqual([
      { currency: "INR", amount: 850, count: 2 },
      { currency: "USD", amount: 600, count: 1 },
    ]);
    expect(result.currency).toBe("INR");
    // totalSpent is the INR portion only — the USD spend is never mixed in.
    expect(result.totalSpent).toBe(850);
    expect(result.remaining).toBe(150); // 1000 - 850
    expect(result.utilization).toBe(85); // 850 / 1000
  });

  it("picks the dominant currency as primary when it is not INR", () => {
    const result = summarizeProjectSpend(
      [
        { currency: "INR", amount: 100 },
        { currency: "USD", amount: 900 },
      ],
      1000,
    );
    expect(result.currency).toBe("USD");
    expect(result.totalSpent).toBe(900);
    expect(result.spentByCurrency).toEqual([
      { currency: "USD", amount: 900, count: 1 },
      { currency: "INR", amount: 100, count: 1 },
    ]);
  });

  it("defaults to INR with zero spend when there are no expenses", () => {
    const result = summarizeProjectSpend([], 500);
    expect(result.spentByCurrency).toEqual([]);
    expect(result.currency).toBe("INR");
    expect(result.totalSpent).toBe(0);
    expect(result.remaining).toBe(500);
    expect(result.utilization).toBe(0);
  });

  it("never divides by zero when the project has no budget", () => {
    const result = summarizeProjectSpend([{ currency: "INR", amount: 200 }], 0);
    expect(result.utilization).toBe(0);
    expect(result.remaining).toBe(-200);
    expect(result.totalSpent).toBe(200);
  });

  it("reports over-budget utilization above 100% in the primary currency", () => {
    const result = summarizeProjectSpend([{ currency: "INR", amount: 600 }], 500);
    expect(result.utilization).toBe(120);
    expect(result.remaining).toBe(-100);
  });
});
