import { describe, expect, it } from "vitest";

import {
  diffCorrections,
  hasCorrections,
  isAnalysisEditable,
  snapshotFromExtraction,
} from "./analysis-audit";
import type { ExtractionResult } from "./extraction";

const result: ExtractionResult = {
  vendorName: "Amazon",
  amount: 1450,
  transactionDate: "2026-06-15",
  currency: "INR",
  paymentMethod: "UPI",
  category: "Software",
  taxInformation: null,
  lowConfidenceReason: null,
  confidenceScore: 92,
  rawOutput: "{}",
};

describe("isAnalysisEditable", () => {
  it("allows DRAFT and REJECTED", () => {
    expect(isAnalysisEditable("DRAFT")).toBe(true);
    expect(isAnalysisEditable("REJECTED")).toBe(true);
  });

  it("freezes submitted / under-review / approved", () => {
    expect(isAnalysisEditable("SUBMITTED")).toBe(false);
    expect(isAnalysisEditable("PENDING_REVIEW")).toBe(false);
    expect(isAnalysisEditable("APPROVED")).toBe(false);
  });
});

describe("snapshotFromExtraction", () => {
  it("captures the model fields verbatim, dropping rawOutput", () => {
    const snap = snapshotFromExtraction(result);
    expect(snap).toEqual({
      vendorName: "Amazon",
      amount: 1450,
      transactionDate: "2026-06-15",
      currency: "INR",
      paymentMethod: "UPI",
      category: "Software",
      taxInformation: null,
      confidenceScore: 92,
      lowConfidenceReason: null,
    });
  });
});

describe("diffCorrections", () => {
  const ai = snapshotFromExtraction(result);

  it("reports no changes when corrected values equal the AI values", () => {
    const changes = diffCorrections({
      aiExtraction: ai,
      vendorName: "Amazon",
      amount: 1450,
      transactionDate: "2026-06-15",
      currency: "INR",
      paymentMethod: "UPI",
      category: "Software",
    });
    expect(changes.every((c) => !c.changed)).toBe(true);
    expect(hasCorrections({ aiExtraction: ai, vendorName: "Amazon", amount: 1450 })).toBe(
      false,
    );
  });

  it("flags only the fields the employee actually changed", () => {
    const changes = diffCorrections({
      aiExtraction: ai,
      vendorName: "Amazon Web Services", // changed
      amount: 1500, // changed
      category: "Software", // unchanged
    });
    const changed = changes.filter((c) => c.changed).map((c) => c.field);
    expect(changed).toEqual(["vendorName", "amount"]);
    expect(hasCorrections({ aiExtraction: ai, amount: 1500 })).toBe(true);
  });

  it("does not treat an absent corrected field as a change", () => {
    const changes = diffCorrections({ aiExtraction: ai });
    expect(changes.every((c) => !c.changed)).toBe(true);
  });

  it("treats a value the AI could not read but the employee filled as a change", () => {
    const changes = diffCorrections({ aiExtraction: ai, taxInformation: "GST 18%" });
    const tax = changes.find((c) => c.field === "taxInformation");
    expect(tax?.changed).toBe(true);
  });
});
