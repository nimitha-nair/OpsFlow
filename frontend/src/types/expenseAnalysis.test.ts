import { describe, expect, it } from "vitest";
import {
  ANALYSIS_STATUS_META,
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
