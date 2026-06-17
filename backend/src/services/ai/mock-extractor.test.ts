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

  it("is deterministic for the same expenseId", async () => {
    const a = await mockExtractor.extract({ expenseId: "same", documentId: "d1" });
    const b = await mockExtractor.extract({ expenseId: "same", documentId: "d2" });
    expect(a).toEqual(b);
  });

  it("varies confidence by expenseId so both COMPLETED and LOW_CONFIDENCE occur", async () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const scores = await Promise.all(
      ids.map((id) => mockExtractor.extract({ expenseId: id, documentId: "d" })),
    );
    const values = scores.map((s) => s.confidenceScore);
    expect(Math.max(...values)).toBeGreaterThanOrEqual(70);
    expect(Math.min(...values)).toBeLessThan(70);
  });

  it("includes a lowConfidenceReason only for low-confidence results", async () => {
    const low = await mockExtractor.extract({ expenseId: "d", documentId: "x" }); // 50
    const high = await mockExtractor.extract({ expenseId: "c", documentId: "x" }); // 99
    expect(low.confidenceScore).toBeLessThan(70);
    expect(typeof low.lowConfidenceReason).toBe("string");
    expect(high.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(high.lowConfidenceReason).toBeNull();
  });
});
