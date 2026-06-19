import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AiAuditCard } from "./AiAuditCard";
import type { Expense } from "../../types/expense";

vi.mock("../../lib/expense-analysis-api", () => ({
  getExpenseAnalysis: vi.fn(async () => null),
}));
vi.mock("../../lib/expenses-api", () => ({
  listExpenseDocuments: vi.fn(async () => []),
  fetchExpenseDocByIdObjectUrl: vi.fn(async () => "blob:mock"),
}));

beforeAll(() => {
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

const expense = {
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
} as Expense;

describe("AiAuditCard", () => {
  it("is collapsed by default and expands on click", async () => {
    render(<AiAuditCard expense={expense} />);
    const toggle = screen.getByRole("button", { name: /ai audit/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-expanded", "true"),
    );
  });
});
