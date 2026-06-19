import { describe, expect, it } from "vitest";
import { mockExtractor } from "./mock-extractor";

describe("mockExtractor", () => {
  it("returns a complete, well-formed result", async () => {
    const r = await mockExtractor.extract({ expenseId: "abc123", documentId: "d1" });
    expect(typeof r.vendorName).toBe("string");
    expect(typeof r.amount).toBe("number");
    expect(r.transactionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(r.confidenceScore).toBeLessThanOrEqual(100);
    expect(r.rawOutput.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same expense + document", async () => {
    const a = await mockExtractor.extract({ expenseId: "same", documentId: "d1" });
    const b = await mockExtractor.extract({ expenseId: "same", documentId: "d1" });
    expect(a).toEqual(b);
  });

  it("varies per document so multi-document amounts are distinct and summable", async () => {
    const a = await mockExtractor.extract({ expenseId: "exp", documentId: "doc-1" });
    const b = await mockExtractor.extract({ expenseId: "exp", documentId: "doc-2" });
    expect(a.amount).not.toBe(b.amount);
  });

  it("varies confidence so both COMPLETED and LOW_CONFIDENCE occur", async () => {
    // Robust: 20 distinct documents almost certainly straddle the 70 threshold,
    // without depending on exact hash tuning.
    const scores = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        mockExtractor.extract({ expenseId: "exp", documentId: `doc-${i}` }),
      ),
    );
    const values = scores.map((s) => s.confidenceScore);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(70);
    expect(Math.min(...values)).toBeLessThan(70);
  });

  it("includes a lowConfidenceReason exactly when confidence is low", async () => {
    // Invariant check across many documents (no dependence on specific hashes).
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        mockExtractor.extract({ expenseId: "exp", documentId: `doc-${i}` }),
      ),
    );
    for (const r of results) {
      if (r.confidenceScore < 70) {
        expect(typeof r.lowConfidenceReason).toBe("string");
      } else {
        expect(r.lowConfidenceReason).toBeNull();
      }
    }
  });
});
