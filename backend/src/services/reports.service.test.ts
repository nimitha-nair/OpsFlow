import { describe, expect, it } from "vitest";

import { monthsBetween } from "./reports.service";

describe("monthsBetween", () => {
  it("defaults to 12 when unbounded", () => {
    expect(monthsBetween()).toBe(12);
    expect(monthsBetween(undefined, undefined)).toBe(12);
  });

  it("defaults to 12 when only one bound is given", () => {
    expect(monthsBetween("2026-01-01", undefined)).toBe(12);
    expect(monthsBetween(undefined, "2026-06-01")).toBe(12);
  });

  it("counts an inclusive month span (~3 months → 3)", () => {
    expect(monthsBetween("2026-04-01", "2026-06-30")).toBe(3);
    expect(monthsBetween("2026-04-15", "2026-06-15")).toBe(3);
  });

  it("counts a single month as 1", () => {
    expect(monthsBetween("2026-06-01", "2026-06-30")).toBe(1);
  });

  it("crosses a year boundary", () => {
    expect(monthsBetween("2025-11-01", "2026-01-31")).toBe(3);
  });

  it("clamps to a minimum of 1", () => {
    // to before from, or same month → at least 1
    expect(monthsBetween("2026-06-10", "2026-06-01")).toBe(1);
    expect(monthsBetween("2026-06-20", "2026-01-01")).toBe(1);
  });

  it("clamps to a maximum of 24", () => {
    expect(monthsBetween("2020-01-01", "2026-06-01")).toBe(24);
  });

  it("defaults junk dates to 12", () => {
    expect(monthsBetween("not-a-date", "also-bad")).toBe(12);
  });
});
