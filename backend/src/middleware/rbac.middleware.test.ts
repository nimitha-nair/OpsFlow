import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserRole from "../types/roles";
import { requirePermission } from "./rbac.middleware";

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

describe("requirePermission", () => {
  it("calls next() when the role has the capability", () => {
    const req = { user: { userId: "a1", role: UserRole.ADMIN } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:create")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks the capability", () => {
    const req = { user: { userId: "e1", role: UserRole.EMPLOYEE } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:reimburse")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:create")(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("passes when the user has ANY of several capabilities", () => {
    const req = { user: { userId: "a1", role: UserRole.ADMIN } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    requirePermission("expense:review", "expense:view-all")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
