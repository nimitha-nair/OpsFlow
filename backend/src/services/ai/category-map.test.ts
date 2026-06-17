import { describe, expect, it } from "vitest";
import { mapToExpenseCategory } from "./category-map";

describe("mapToExpenseCategory", () => {
  it("maps exact enum names case-insensitively", () => {
    expect(mapToExpenseCategory("TRAVEL")).toBe("TRAVEL");
    expect(mapToExpenseCategory("travel")).toBe("TRAVEL");
  });
  it("maps common synonyms", () => {
    expect(mapToExpenseCategory("Meals")).toBe("FOOD");
    expect(mapToExpenseCategory("Restaurant")).toBe("FOOD");
    expect(mapToExpenseCategory("Software subscription")).toBe("SOFTWARE");
    expect(mapToExpenseCategory("Cloud")).toBe("CLOUD_SERVICES");
  });
  it("returns undefined for unknown / empty", () => {
    expect(mapToExpenseCategory("Spaceship")).toBeUndefined();
    expect(mapToExpenseCategory(null)).toBeUndefined();
    expect(mapToExpenseCategory(undefined)).toBeUndefined();
  });
});
