import { describe, expect, it } from "vitest";

import { createExpenseBody } from "./expense.schema";

describe("createExpenseBody (AI path)", () => {
  it("accepts a minimal project draft with no amount/date/category", () => {
    const r = createExpenseBody.safeParse({
      scope: "PROJECT",
      projectId: "project-123",
      isDraft: true,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a minimal general draft with only scope", () => {
    const r = createExpenseBody.safeParse({ scope: "GENERAL", isDraft: true });
    expect(r.success).toBe(true);
  });

  it("allows a PROJECT draft with no projectId (deferred assignment)", () => {
    // Revision 2: project is assigned at the verify step / required only at submit.
    const r = createExpenseBody.safeParse({ scope: "PROJECT", isDraft: true });
    expect(r.success).toBe(true);
  });

  it("still accepts a full manual payload", () => {
    const r = createExpenseBody.safeParse({
      scope: "GENERAL",
      type: "CASH",
      category: "TRAVEL",
      amount: 100,
      currency: "INR",
      description: "Taxi",
      expenseDate: "2026-06-19",
    });
    expect(r.success).toBe(true);
  });
});
