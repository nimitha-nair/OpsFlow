import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExpenseDetailTable } from "./ExpenseDetailTable";
import { groupExpensesByCurrency } from "./expense-detail-group";
import type { Expense } from "../../types/expense";

function expense(over: Partial<Expense>): Expense {
  return {
    id: "e1",
    employeeId: "u1",
    scope: "GENERAL",
    type: "CASH",
    category: "TRAVEL",
    amount: 100,
    currency: "INR",
    description: "",
    expenseDate: "2026-06-01",
    approvalStatus: "APPROVED",
    reimbursementStatus: "PENDING",
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z",
    ...over,
  };
}

describe("groupExpensesByCurrency", () => {
  it("groups by currency with per-currency subtotals (never combined)", () => {
    const groups = groupExpensesByCurrency([
      expense({ id: "a", currency: "INR", amount: 5000 }),
      expense({ id: "b", currency: "USD", amount: 600 }),
      expense({ id: "c", currency: "inr", amount: 2000 }),
    ]);
    expect(groups.map((g) => [g.currency, g.subtotal, g.count])).toEqual([
      ["INR", 7000, 2],
      ["USD", 600, 1],
    ]);
  });

  it("orders rows newest-first within a currency", () => {
    const groups = groupExpensesByCurrency([
      expense({ id: "old", expenseDate: "2026-01-01" }),
      expense({ id: "new", expenseDate: "2026-06-01" }),
      expense({ id: "mid", expenseDate: "2026-03-01" }),
    ]);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("orders currency groups by subtotal descending", () => {
    const groups = groupExpensesByCurrency([
      expense({ currency: "USD", amount: 50 }),
      expense({ currency: "INR", amount: 9000 }),
    ]);
    expect(groups.map((g) => g.currency)).toEqual(["INR", "USD"]);
  });
});

describe("ExpenseDetailTable", () => {
  it("renders the employee column for admin scope and resolves names", () => {
    render(
      <ExpenseDetailTable
        expenses={[expense({ employeeId: "u1", currency: "USD", amount: 600 })]}
        scope="admin"
        employeeNames={new Map([["u1", "Asha"]])}
      />,
    );
    expect(screen.getByText("Employee")).toBeInTheDocument();
    expect(screen.getByText("Asha")).toBeInTheDocument();
  });

  it("omits the employee column for employee scope", () => {
    render(<ExpenseDetailTable expenses={[expense({})]} scope="employee" />);
    expect(screen.queryByText("Employee")).toBeNull();
  });
});
