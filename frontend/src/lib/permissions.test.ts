import { describe, expect, it } from "vitest";
import { can, expensesBasePath } from "./permissions";

describe("can()", () => {
  it("lets ADMIN create and bulk-upload", () => {
    expect(can("ADMIN", "expense:create")).toBe(true);
    expect(can("ADMIN", "expense:bulk-upload")).toBe(true);
  });
  it("does not let EMPLOYEE reimburse or review", () => {
    expect(can("EMPLOYEE", "expense:reimburse")).toBe(false);
    expect(can("EMPLOYEE", "expense:review")).toBe(false);
  });
  it("lets HR review and create", () => {
    expect(can("HR", "expense:review")).toBe(true);
    expect(can("HR", "expense:create")).toBe(true);
  });
  it("returns false for an undefined role", () => {
    expect(can(undefined, "expense:create")).toBe(false);
  });
});

describe("expensesBasePath()", () => {
  it("maps each role to its expenses route base", () => {
    expect(expensesBasePath("EMPLOYEE")).toBe("/employee/expenses");
    expect(expensesBasePath("HR")).toBe("/hr/expenses");
    expect(expensesBasePath("ADMIN")).toBe("/admin/expenses");
  });
});
