import { describe, expect, it } from "vitest";

import { assertSubmittable } from "./expense.submit-gate";

describe("assertSubmittable", () => {
  it("rejects a zero or missing amount", () => {
    expect(() =>
      assertSubmittable({ amount: 0, category: "TRAVEL", expenseDate: "2026-06-19" }),
    ).toThrow(/amount/i);
    expect(() =>
      assertSubmittable({ category: "TRAVEL", expenseDate: "2026-06-19" }),
    ).toThrow(/amount/i);
  });

  it("rejects a missing category", () => {
    expect(() =>
      assertSubmittable({ amount: 10, expenseDate: "2026-06-19" }),
    ).toThrow(/category/i);
  });

  it("rejects a missing expense date", () => {
    expect(() => assertSubmittable({ amount: 10, category: "TRAVEL" })).toThrow(
      /date/i,
    );
  });

  it("accepts a complete expense", () => {
    expect(() =>
      assertSubmittable({ amount: 10, category: "TRAVEL", expenseDate: "2026-06-19" }),
    ).not.toThrow();
  });
});
