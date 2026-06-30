import { describe, expect, it } from "vitest";
import UserRole from "./roles";
import { hasCapability, ROLE_CAPABILITIES } from "./permissions";

describe("capability map", () => {
  it("lets EMPLOYEE create, submit and bulk-upload", () => {
    expect(hasCapability(UserRole.EMPLOYEE, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:submit")).toBe(true);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:bulk-upload")).toBe(true);
  });

  it("does not let EMPLOYEE view-all, review or reimburse", () => {
    expect(hasCapability(UserRole.EMPLOYEE, "expense:view-all")).toBe(false);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:review")).toBe(false);
    expect(hasCapability(UserRole.EMPLOYEE, "expense:reimburse")).toBe(false);
  });

  it("lets ADMIN create and reimburse but NOT review", () => {
    expect(hasCapability(UserRole.ADMIN, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.ADMIN, "expense:reimburse")).toBe(true);
    expect(hasCapability(UserRole.ADMIN, "expense:review")).toBe(false);
  });

  it("lets HR review and create but NOT reimburse", () => {
    expect(hasCapability(UserRole.HR, "expense:review")).toBe(true);
    expect(hasCapability(UserRole.HR, "expense:create")).toBe(true);
    expect(hasCapability(UserRole.HR, "expense:reimburse")).toBe(false);
  });

  it("returns false for an unknown role", () => {
    expect(hasCapability("GUEST", "expense:create")).toBe(false);
  });

  it("defines capabilities for every role", () => {
    expect(Object.keys(ROLE_CAPABILITIES).sort()).toEqual(
      [UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.HR].sort(),
    );
  });
});
