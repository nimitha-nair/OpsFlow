import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import { ExpenseReportPage } from "./ExpenseReportPage";
import type { Expense } from "../../types/expense";

vi.mock("../../lib/expenses-api", () => ({
  apiErrorMessage: (_e: unknown, f: string) => f,
  getExpense: vi.fn(),
  getExpenseReviewInfo: vi.fn(async () => null),
}));
vi.mock("../../lib/projects-api", () => ({ getProject: vi.fn() }));
// Heavy children that fetch/render documents are stubbed for this unit test.
vi.mock("../../components/expenses/ReceiptThumbnails", () => ({
  ReceiptThumbnails: () => <div>thumbnails</div>,
}));
vi.mock("../../components/expenses/AnalysisAuditPanel", () => ({
  AnalysisAuditPanel: () => <div>audit</div>,
}));

import { getExpense } from "../../lib/expenses-api";

const expense = {
  id: "e1",
  employeeId: "u1",
  scope: "GENERAL",
  type: "DOCUMENT",
  category: "TRAVEL",
  amount: 1651,
  currency: "INR",
  description: "Trip",
  expenseDate: "2026-06-19",
  approvalStatus: "APPROVED",
  reimbursementStatus: "PENDING",
  createdAt: "2026-06-19T00:00:00Z",
  updatedAt: "2026-06-19T00:00:00Z",
} as Expense;

describe("ExpenseReportPage", () => {
  it("renders the report with an Export PDF action", async () => {
    vi.mocked(getExpense).mockResolvedValue(expense);
    render(
      <MemoryRouter initialEntries={["/employee/expenses/e1/report"]}>
        <Routes>
          <Route
            path="/employee/expenses/:id/report"
            element={<ExpenseReportPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("Expense Report")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /export pdf/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Expense details")).toBeInTheDocument();
  });
});
