import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/expense.service", () => ({
  listMyExpenses: vi.fn(),
  listExpensesByStatus: vi.fn(),
  listPendingExpenses: vi.fn(),
  listReimbursements: vi.fn(),
  listApprovedExpenses: vi.fn(),
}));
vi.mock("../services/expenseAnalysis.service", () => ({
  riskLevelsForExpenses: vi.fn(async () => new Map()),
}));
vi.mock("../services/notification.service", () => ({ notify: vi.fn() }));
vi.mock("../services/ticket.service", () => ({ getStaffIds: vi.fn() }));

import { getMyExpenses } from "./expense.controller";
import { listMyExpenses } from "../services/expense.service";

const listMyMock = vi.mocked(listMyExpenses);

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}
beforeEach(() => vi.clearAllMocks());

function fakeExpenses(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, code: `EXP-${i}`, description: i === 0 ? "taxi" : "lunch",
  }));
}

describe("getMyExpenses pagination", () => {
  it("returns a paginated envelope, 20 per page by default", async () => {
    listMyMock.mockResolvedValue(fakeExpenses(25) as never);
    const req = {
      user: { userId: "e1", role: "EMPLOYEE" },
      valid: { query: { page: 1, limit: 20 } },
    } as unknown as Request;
    const res = mockRes();

    await getMyExpenses(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(body.data).toHaveLength(20);
    expect(body.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  it("applies the free-text q filter before paginating", async () => {
    listMyMock.mockResolvedValue(fakeExpenses(25) as never);
    const req = {
      user: { userId: "e1", role: "EMPLOYEE" },
      valid: { query: { page: 1, limit: 20, q: "taxi" } },
    } as unknown as Request;
    const res = mockRes();

    await getMyExpenses(req, res);

    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it("returns ALL items when no page/limit is supplied (opt-in pagination)", async () => {
    listMyMock.mockResolvedValue(fakeExpenses(25) as never);
    const req = {
      user: { userId: "e1", role: "EMPLOYEE" },
      // No page or limit — simulates a full-dataset consumer (dashboard, reports).
      valid: { query: {} },
    } as unknown as Request;
    const res = mockRes();

    await getMyExpenses(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(body.data).toHaveLength(25);
    expect(body.pagination.total).toBe(25);
    expect(body.pagination.totalPages).toBe(1);
  });
});
