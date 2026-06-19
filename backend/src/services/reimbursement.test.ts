import { describe, expect, it } from "vitest";

import {
  isValidReimbursementTransition,
  nextReimbursementStatuses,
} from "./reimbursement";

describe("isValidReimbursementTransition", () => {
  it("allows forward moves", () => {
    expect(isValidReimbursementTransition("PENDING", "PROCESSING")).toBe(true);
    expect(isValidReimbursementTransition("PROCESSING", "PAID")).toBe(true);
    // Forward jump is still forward.
    expect(isValidReimbursementTransition("PENDING", "PAID")).toBe(true);
  });

  it("rejects backward moves", () => {
    expect(isValidReimbursementTransition("PAID", "PROCESSING")).toBe(false);
    expect(isValidReimbursementTransition("PAID", "PENDING")).toBe(false);
    expect(isValidReimbursementTransition("PROCESSING", "PENDING")).toBe(false);
  });

  it("rejects no-op (same status)", () => {
    expect(isValidReimbursementTransition("PENDING", "PENDING")).toBe(false);
    expect(isValidReimbursementTransition("PAID", "PAID")).toBe(false);
  });
});

describe("nextReimbursementStatuses", () => {
  it("lists only forward statuses", () => {
    expect(nextReimbursementStatuses("PENDING")).toEqual(["PROCESSING", "PAID"]);
    expect(nextReimbursementStatuses("PROCESSING")).toEqual(["PAID"]);
    expect(nextReimbursementStatuses("PAID")).toEqual([]);
  });
});
