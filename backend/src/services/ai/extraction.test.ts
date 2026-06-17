import { describe, expect, it } from "vitest";
import {
  MalformedExtractionError,
  parseModelJson,
  statusForConfidence,
} from "./extraction";

const good = JSON.stringify({
  vendorName: "Uber",
  amount: 450.5,
  transactionDate: "2026-06-15",
  currency: "INR",
  paymentMethod: "CARD",
  category: "Travel",
  taxInformation: "GST 18%",
  confidenceScore: 92,
});

describe("parseModelJson", () => {
  it("parses a clean JSON object", () => {
    const r = parseModelJson(good);
    expect(r.vendorName).toBe("Uber");
    expect(r.amount).toBe(450.5);
    expect(r.confidenceScore).toBe(92);
    expect(r.rawOutput).toBe(good);
  });

  it("strips ```json fences and extracts the object", () => {
    const r = parseModelJson("```json\n" + good + "\n```");
    expect(r.vendorName).toBe("Uber");
  });

  it("coerces missing fields to null and clamps confidence", () => {
    const r = parseModelJson(JSON.stringify({ vendorName: "X", confidenceScore: 240 }));
    expect(r.amount).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.lowConfidenceReason).toBeNull();
    expect(r.confidenceScore).toBe(100);
  });

  it("parses a model-provided lowConfidenceReason", () => {
    const r = parseModelJson(
      JSON.stringify({ confidenceScore: 40, lowConfidenceReason: "blurry image" }),
    );
    expect(r.lowConfidenceReason).toBe("blurry image");
  });

  it("throws MalformedExtractionError on non-JSON", () => {
    expect(() => parseModelJson("sorry, I cannot read this")).toThrow(
      MalformedExtractionError,
    );
  });

  it("throws MalformedExtractionError when amount is not a number", () => {
    expect(() =>
      parseModelJson(JSON.stringify({ amount: "free", confidenceScore: 50 })),
    ).toThrow(MalformedExtractionError);
  });
});

describe("statusForConfidence", () => {
  it("returns COMPLETED at or above threshold", () => {
    expect(statusForConfidence(70, 70)).toBe("COMPLETED");
    expect(statusForConfidence(95, 70)).toBe("COMPLETED");
  });
  it("returns LOW_CONFIDENCE below threshold", () => {
    expect(statusForConfidence(69, 70)).toBe("LOW_CONFIDENCE");
  });
});
