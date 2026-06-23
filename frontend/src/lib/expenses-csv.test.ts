import { describe, expect, it } from "vitest";

import { toExpensesCsv } from "./expenses-csv";
import type { Expense } from "../types/expense";

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    employeeId: "u1",
    scope: "GENERAL",
    type: "DOCUMENT",
    category: "TRAVEL",
    amount: 100,
    currency: "INR",
    description: "Taxi",
    expenseDate: "2026-06-19",
    approvalStatus: "APPROVED",
    reimbursementStatus: "PENDING",
    createdAt: "2026-06-19T00:00:00Z",
    updatedAt: "2026-06-19T00:00:00Z",
    ...over,
  } as Expense;
}

const lookups = { employee: () => "Alice", project: () => "Apollo" };

describe("toExpensesCsv", () => {
  it("emits a header row plus one line per expense", () => {
    const csv = toExpensesCsv([expense(), expense({ id: "e2" })], lookups);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toContain("Date");
    expect(lines[0]).toContain("Amount");
  });

  it("includes the human-readable Ref code as the first column", () => {
    const csv = toExpensesCsv([expense({ code: "EXP-0007" })], lookups);
    const lines = csv.trim().split("\n");
    expect(lines[0]!.split(",")[0]).toBe("Ref");
    expect(lines[1]!.split(",")[0]).toBe("EXP-0007");
  });

  it("leaves the Ref blank when an expense has no code yet", () => {
    const csv = toExpensesCsv([expense()], lookups);
    const lines = csv.trim().split("\n");
    expect(lines[1]!.split(",")[0]).toBe("");
  });

  it("escapes values containing commas or quotes (RFC 4180)", () => {
    const csv = toExpensesCsv(
      [expense({ description: 'Lunch, "team"' })],
      { employee: () => "Bob, Jr.", project: () => "Apollo" },
    );
    expect(csv).toContain('"Lunch, ""team"""');
    expect(csv).toContain('"Bob, Jr."');
  });

  it("renders General for non-project scope", () => {
    const csv = toExpensesCsv([expense({ scope: "GENERAL" })], lookups);
    expect(csv).toContain("General");
  });
});
