import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock every module the controller pulls in that would otherwise reach Firebase,
// so these unit tests exercise only the notification wiring.
vi.mock("../services/expense.service", () => ({
  submitExpense: vi.fn(),
  approveExpense: vi.fn(),
  rejectExpense: vi.fn(),
  setReimbursementStatus: vi.fn(),
}));
vi.mock("../services/expense-document.service", () => ({}));
vi.mock("../services/expenseAnalysis.service", () => ({
  deleteAnalysisForExpense: vi.fn(),
  riskLevelsForExpenses: vi.fn(),
}));
vi.mock("../services/expense-documents.read", () => ({ deriveDocumentIds: vi.fn() }));
vi.mock("../middleware/upload", () => ({ MAX_DOCS: 10 }));
vi.mock("../services/notification.service", () => ({ notify: vi.fn() }));
vi.mock("../services/ticket.service", () => ({ getStaffIds: vi.fn() }));

import {
  patchApprove,
  patchReject,
  patchReimbursement,
  postSubmitExpense,
} from "./expense.controller";
import { notify } from "../services/notification.service";
import { getStaffIds } from "../services/ticket.service";
import {
  approveExpense,
  rejectExpense,
  setReimbursementStatus,
  submitExpense,
} from "../services/expense.service";

const notifyMock = vi.mocked(notify);
const getStaffIdsMock = vi.mocked(getStaffIds);
const submitExpenseMock = vi.mocked(submitExpense);
const approveExpenseMock = vi.mocked(approveExpense);
const rejectExpenseMock = vi.mocked(rejectExpense);
const setReimbursementStatusMock = vi.mocked(setReimbursementStatus);

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

// A minimal Expense-shaped object; only fields the controller reads matter.
function expense(overrides: Record<string, unknown> = {}) {
  return {
    id: "exp1",
    code: "EXP-0041",
    employeeId: "emp1",
    reimbursementStatus: "PENDING",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("expense lifecycle notifications", () => {
  it("submit notifies HR/Admin reviewers, excluding the submitter", async () => {
    submitExpenseMock.mockResolvedValue(expense());
    getStaffIdsMock.mockResolvedValue(["hr1", "admin1", "emp1"]);
    const req = {
      user: { userId: "emp1", role: "EMPLOYEE" },
      valid: { params: { id: "exp1" } },
    } as unknown as Request;

    await postSubmitExpense(req, mockRes());

    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      ["hr1", "admin1", "emp1"],
      expect.objectContaining({
        type: "EXPENSE_SUBMITTED",
        body: expect.stringContaining("EXP-0041"),
      }),
      "emp1",
    );
  });

  it("approve notifies the submitter", async () => {
    approveExpenseMock.mockResolvedValue(expense());
    const req = {
      user: { userId: "hr1", role: "HR" },
      valid: { params: { id: "exp1" }, body: { remarks: "ok" } },
    } as unknown as Request;

    await patchApprove(req, mockRes());

    expect(notifyMock).toHaveBeenCalledWith(
      ["emp1"],
      expect.objectContaining({ type: "EXPENSE_APPROVED" }),
      "hr1",
    );
  });

  it("reject notifies the submitter and includes the remark", async () => {
    rejectExpenseMock.mockResolvedValue(expense());
    const req = {
      user: { userId: "hr1", role: "HR" },
      valid: { params: { id: "exp1" }, body: { remarks: "missing receipt" } },
    } as unknown as Request;

    await patchReject(req, mockRes());

    expect(notifyMock).toHaveBeenCalledWith(
      ["emp1"],
      expect.objectContaining({
        type: "EXPENSE_REJECTED",
        body: expect.stringContaining("missing receipt"),
      }),
      "hr1",
    );
  });

  it("marking PAID notifies the submitter", async () => {
    setReimbursementStatusMock.mockResolvedValue(
      expense({ reimbursementStatus: "PAID" }),
    );
    const req = {
      user: { userId: "admin1", role: "ADMIN" },
      valid: { params: { id: "exp1" }, body: { reimbursementStatus: "PAID" } },
    } as unknown as Request;

    await patchReimbursement(req, mockRes());

    expect(notifyMock).toHaveBeenCalledWith(
      ["emp1"],
      expect.objectContaining({ type: "EXPENSE_PAID" }),
      "admin1",
    );
  });

  it("a non-PAID reimbursement update does not notify", async () => {
    setReimbursementStatusMock.mockResolvedValue(
      expense({ reimbursementStatus: "PROCESSING" }),
    );
    const req = {
      user: { userId: "admin1", role: "ADMIN" },
      valid: { params: { id: "exp1" }, body: { reimbursementStatus: "PROCESSING" } },
    } as unknown as Request;

    await patchReimbursement(req, mockRes());

    expect(notifyMock).not.toHaveBeenCalled();
  });
});
