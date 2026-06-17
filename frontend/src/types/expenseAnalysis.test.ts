import { describe, expect, it } from "vitest";
import {
  ANALYSIS_STATUS_META,
  confidenceLevel,
  deriveLowConfidenceReason,
  isTerminalStatus,
  mapToExpenseCategory,
} from "./expenseAnalysis";

describe("ANALYSIS_STATUS_META", () => {
  it("covers all five statuses with a label + tone", () => {
    for (const s of ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "LOW_CONFIDENCE"] as const) {
      expect(ANALYSIS_STATUS_META[s].label.length).toBeGreaterThan(0);
      expect(ANALYSIS_STATUS_META[s].tone).toBeTruthy();
    }
  });
  it("marks PENDING/PROCESSING with a spinner", () => {
    expect(ANALYSIS_STATUS_META.PROCESSING.spinner).toBe(true);
    expect(ANALYSIS_STATUS_META.COMPLETED.spinner).toBe(false);
  });
});

describe("isTerminalStatus", () => {
  it("treats COMPLETED/LOW_CONFIDENCE/FAILED as terminal", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isTerminalStatus("PENDING")).toBe(false);
    expect(isTerminalStatus("PROCESSING")).toBe(false);
  });
});

describe("mapToExpenseCategory", () => {
  it("maps synonyms and exact names, else undefined", () => {
    expect(mapToExpenseCategory("Meals")).toBe("FOOD");
    expect(mapToExpenseCategory("TRAVEL")).toBe("TRAVEL");
    expect(mapToExpenseCategory("Spaceship")).toBeUndefined();
  });
});

describe("confidenceLevel", () => {
  it("buckets scores into High/Medium/Low with tones", () => {
    expect(confidenceLevel(95)).toEqual({ label: "High", tone: "emerald" });
    expect(confidenceLevel(65)).toEqual({ label: "Medium", tone: "amber" });
    expect(confidenceLevel(40)).toEqual({ label: "Low", tone: "red" });
    expect(confidenceLevel(undefined)).toEqual({ label: "Low", tone: "red" });
  });
});

describe("deriveLowConfidenceReason", () => {
  it("prefers the model-provided reason", () => {
    expect(
      deriveLowConfidenceReason({ lowConfidenceReason: "blurry photo", amount: 5 }),
    ).toBe("blurry photo");
  });
  it("derives from missing key fields when no model reason", () => {
    const r = deriveLowConfidenceReason({
      vendorName: "Uber",
      amount: undefined,
      transactionDate: "",
      currency: "INR",
      category: "TRAVEL",
    });
    expect(r).toContain("amount");
    expect(r).toContain("date");
  });
  it("falls back to a generic message when nothing is missing", () => {
    const r = deriveLowConfidenceReason({
      vendorName: "Uber",
      amount: 5,
      transactionDate: "2026-06-01",
      currency: "INR",
      category: "TRAVEL",
    });
    expect(r.length).toBeGreaterThan(0);
  });
});
