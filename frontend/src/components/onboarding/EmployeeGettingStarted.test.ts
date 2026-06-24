import { afterEach, describe, expect, it } from "vitest";
import { employeeOnboardingKey } from "./EmployeeGettingStarted";

afterEach(() => localStorage.clear());

describe("employeeOnboardingKey", () => {
  it("is namespaced per user", () => {
    expect(employeeOnboardingKey("u1")).toBe("opsflow.onboarding.employee.u1");
    expect(employeeOnboardingKey("u1")).not.toBe(employeeOnboardingKey("u2"));
  });

  it("one user's dismissal does not dismiss another's", () => {
    localStorage.setItem(employeeOnboardingKey("u1"), "1");
    expect(localStorage.getItem(employeeOnboardingKey("u1"))).toBe("1");
    expect(localStorage.getItem(employeeOnboardingKey("u2"))).toBeNull();
  });
});
