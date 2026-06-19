import { describe, expect, it } from "vitest";

import { aggregateExtractions } from "./aggregate";
import type { ExtractionResult } from "./extraction";

function r(over: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    vendorName: null,
    amount: null,
    transactionDate: null,
    currency: null,
    paymentMethod: null,
    category: null,
    taxInformation: null,
    lowConfidenceReason: null,
    confidenceScore: 90,
    rawOutput: "{}",
    ...over,
  };
}

describe("aggregateExtractions", () => {
  it("sums amounts across documents", () => {
    const agg = aggregateExtractions([
      r({ amount: 1000 }),
      r({ amount: 500 }),
    ]);
    expect(agg.amount).toBe(1500);
  });

  it("treats null amounts as zero but keeps null when all are null", () => {
    expect(aggregateExtractions([r({ amount: 1000 }), r({ amount: null })]).amount).toBe(
      1000,
    );
    expect(aggregateExtractions([r({ amount: null }), r({ amount: null })]).amount).toBe(
      null,
    );
  });

  it("uses the earliest date", () => {
    const agg = aggregateExtractions([
      r({ transactionDate: "2026-06-10" }),
      r({ transactionDate: "2026-06-02" }),
    ]);
    expect(agg.transactionDate).toBe("2026-06-02");
  });

  it("takes vendor/category/currency from the first (primary) document", () => {
    const agg = aggregateExtractions([
      r({ vendorName: "Vendor A", category: "Travel", currency: "INR" }),
      r({ vendorName: "Vendor B", category: "Food", currency: "USD" }),
    ]);
    expect(agg.vendorName).toBe("Vendor A");
    expect(agg.category).toBe("Travel");
    expect(agg.currency).toBe("INR");
  });

  it("uses the lowest confidence (most conservative)", () => {
    const agg = aggregateExtractions([
      r({ confidenceScore: 95 }),
      r({ confidenceScore: 60 }),
    ]);
    expect(agg.confidenceScore).toBe(60);
  });

  it("concatenates distinct tax information", () => {
    const agg = aggregateExtractions([
      r({ taxInformation: "GST 18%" }),
      r({ taxInformation: "GST 5%" }),
      r({ taxInformation: "GST 18%" }),
    ]);
    expect(agg.taxInformation).toBe("GST 18%; GST 5%");
  });

  it("passes a single document through unchanged (amount/vendor/date)", () => {
    const single = r({ vendorName: "Solo", amount: 42, transactionDate: "2026-06-01" });
    const agg = aggregateExtractions([single]);
    expect(agg.amount).toBe(42);
    expect(agg.vendorName).toBe("Solo");
    expect(agg.transactionDate).toBe("2026-06-01");
  });
});
