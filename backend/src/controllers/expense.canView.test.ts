import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the service layer.
vi.mock("../services/expense.service", () => ({
  requireExpense: vi.fn(),
  getExpenseById: vi.fn(),
  addExpenseDocumentId: vi.fn(),
  approveExpense: vi.fn(),
  createExpense: vi.fn(),
  createBulkDrafts: vi.fn(),
  deleteDraftExpense: vi.fn(),
  getLatestReview: vi.fn(),
  listApprovedExpenses: vi.fn(),
  listExpensesByStatus: vi.fn(),
  listMyExpenses: vi.fn(),
  listPendingExpenses: vi.fn(),
  listReimbursements: vi.fn(),
  listProjectsSpending: vi.fn(),
  getProjectSpending: vi.fn(),
  rejectExpense: vi.fn(),
  removeExpenseDocumentId: vi.fn(),
  setReimbursementStatus: vi.fn(),
  startReview: vi.fn(),
  submitExpense: vi.fn(),
  updateExpense: vi.fn(),
}));
vi.mock("../services/expense-document.service", () => ({
  deleteExpenseDocument: vi.fn(),
  getDocumentById: vi.fn(),
  getExpenseDocumentMeta: vi.fn(),
  listExpenseDocuments: vi.fn(),
  resolveExpenseDocumentFile: vi.fn(),
  saveExpenseDocument: vi.fn(),
}));
vi.mock("../services/expenseAnalysis.service", () => ({
  deleteAnalysisForExpense: vi.fn(),
  riskLevelsForExpenses: vi.fn(),
}));
vi.mock("../middleware/upload", () => ({ MAX_DOCS: 5 }));
vi.mock("../services/expense-documents.read", () => ({ deriveDocumentIds: vi.fn() }));
vi.mock("../services/expense.bulk", () => ({ createBulkDrafts: vi.fn() }));
vi.mock("../services/notification.service", () => ({ notify: vi.fn() }));
vi.mock("../services/ticket.service", () => ({ getStaffIds: vi.fn() }));

import { getExpense } from "./expense.controller";
import { requireExpense, getExpenseById } from "../services/expense.service";

const requireExpenseMock = vi.mocked(requireExpense);
const getExpenseByIdMock = vi.mocked(getExpenseById);

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getExpense canView — own-expense access", () => {
  it("allows ADMIN to view their OWN draft expense (200)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp1",
      employeeId: "admin1",
      approvalStatus: "DRAFT",
    } as never);
    getExpenseByIdMock.mockResolvedValue({ id: "exp1" } as never);

    const req = {
      user: { userId: "admin1", role: "ADMIN" },
      valid: { params: { id: "exp1" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forbids ADMIN from viewing ANOTHER user's draft expense (403)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp2",
      employeeId: "emp1",
      approvalStatus: "DRAFT",
    } as never);

    const req = {
      user: { userId: "admin1", role: "ADMIN" },
      valid: { params: { id: "exp2" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getExpenseByIdMock).not.toHaveBeenCalled();
  });

  it("allows HR to view their OWN draft expense (200)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp3",
      employeeId: "hr1",
      approvalStatus: "DRAFT",
    } as never);
    getExpenseByIdMock.mockResolvedValue({ id: "exp3" } as never);

    const req = {
      user: { userId: "hr1", role: "HR" },
      valid: { params: { id: "exp3" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forbids HR from viewing ANOTHER user's draft expense (403)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp4",
      employeeId: "emp2",
      approvalStatus: "DRAFT",
    } as never);

    const req = {
      user: { userId: "hr1", role: "HR" },
      valid: { params: { id: "exp4" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getExpenseByIdMock).not.toHaveBeenCalled();
  });

  it("allows ADMIN to view another user's APPROVED expense (200)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp5",
      employeeId: "emp3",
      approvalStatus: "APPROVED",
    } as never);
    getExpenseByIdMock.mockResolvedValue({ id: "exp5" } as never);

    const req = {
      user: { userId: "admin1", role: "ADMIN" },
      valid: { params: { id: "exp5" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("forbids EMPLOYEE from viewing ANOTHER user's expense (403)", async () => {
    requireExpenseMock.mockResolvedValue({
      id: "exp6",
      employeeId: "emp_other",
      approvalStatus: "APPROVED",
    } as never);

    const req = {
      user: { userId: "emp1", role: "EMPLOYEE" },
      valid: { params: { id: "exp6" } },
    } as unknown as Request;
    const res = mockRes();

    await getExpense(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(getExpenseByIdMock).not.toHaveBeenCalled();
  });
});
