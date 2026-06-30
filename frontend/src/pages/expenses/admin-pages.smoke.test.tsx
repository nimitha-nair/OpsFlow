import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("../../context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "a1", name: "Admin", email: "a@x", role: "ADMIN" },
  }),
}));
vi.mock("../../lib/expense-analysis-api", () => ({
  getExpenseAnalysis: vi.fn(async () => null),
}));

const adminExpense = {
  id: "e1",
  employeeId: "u1",
  scope: "GENERAL",
  type: "DOCUMENT",
  category: "TRAVEL",
  amount: 100,
  currency: "INR",
  description: "Trip",
  expenseDate: "2026-06-19",
  approvalStatus: "APPROVED",
  reimbursementStatus: "PENDING",
  documentId: "d1",
  documentIds: ["d1"],
  creationMethod: "AI",
  createdAt: "2026-06-19T00:00:00Z",
  updatedAt: "2026-06-19T00:00:00Z",
};

const emptyPaged = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

vi.mock("../../lib/expenses-api", () => ({
  apiErrorMessage: (_e: unknown, f: string) => f,
  listReviewExpenses: vi.fn(async () => []),
  listReimbursementsPaged: vi.fn(async () => emptyPaged),
  updateReimbursementStatus: vi.fn(async () => ({})),
  getExpense: vi.fn(async () => adminExpense),
  getExpenseReviewInfo: vi.fn(async () => null),
  getExpenseDocument: vi.fn(async () => null),
  downloadExpenseDocument: vi.fn(),
  viewExpenseDocument: vi.fn(),
  deleteExpense: vi.fn(),
  submitExpense: vi.fn(),
  approveExpense: vi.fn(),
  rejectExpense: vi.fn(),
  startExpenseReview: vi.fn(),
}));
vi.mock("../../lib/users-api", () => ({
  apiErrorMessage: (_e: unknown, f: string) => f,
  listUsers: vi.fn(async () => ({ data: [] })),
}));
vi.mock("../../lib/projects-api", () => ({
  listProjects: vi.fn(async () => ({ data: [] })),
  listProjectsSpending: vi.fn(async () => []),
  getProject: vi.fn(async () => ({ id: "p1", name: "Apollo" })),
}));

import { ExpensesOverviewPage } from "./ExpensesOverviewPage";
import { ReimbursementsPage } from "./ReimbursementsPage";
import { ExpenseDetailsPage } from "./ExpenseDetailsPage";

describe("admin expense pages smoke", () => {
  it("ExpensesOverviewPage renders without throwing", async () => {
    const { container } = render(
      <MemoryRouter>
        <ExpensesOverviewPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("ReimbursementsPage renders without throwing", async () => {
    const { container } = render(
      <MemoryRouter>
        <ReimbursementsPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(container).toBeTruthy());
  });

  it("ExpenseDetailsPage (admin) renders the expense without throwing", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/expenses/e1"]}>
        <Routes>
          <Route path="/admin/expenses/:id" element={<ExpenseDetailsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText("Expense Details")).toBeInTheDocument(),
    );
    // The admin branch should render (summary + AI Audit), not crash.
    await waitFor(() =>
      expect(screen.getByText(/AI Audit/i)).toBeInTheDocument(),
    );
  });
});
