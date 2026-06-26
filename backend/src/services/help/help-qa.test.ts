import { describe, expect, it } from "vitest";

import {
  HELP_SYSTEM_PROMPT,
  buildHelpMessages,
  retrieveMockAnswer,
} from "./help-qa";

describe("buildHelpMessages — grounded prompt builder", () => {
  it("instructs the model to answer ONLY from the manual", () => {
    expect(HELP_SYSTEM_PROMPT).toMatch(/USING ONLY/);
    expect(HELP_SYSTEM_PROMPT).toMatch(/does not cover/i);
    expect(HELP_SYSTEM_PROMPT).toMatch(/No outside knowledge/i);
    const [system] = buildHelpMessages("EMPLOYEE", "anything");
    expect(system?.role).toBe("system");
    expect(system?.content).toContain("USING ONLY");
  });

  it("includes the question and the role's own sections", () => {
    const msgs = buildHelpMessages("EMPLOYEE", "How do I submit an expense?");
    const user = msgs.find((m) => m.role === "user");
    expect(user?.content).toContain("How do I submit an expense?");
    // Shared COMMON section is always present.
    expect(user?.content).toContain("Getting around");
    // Employee-scoped section is present.
    expect(user?.content).toContain("Submitting expenses");
  });

  it("scopes content per role — admin-only sections never reach an employee", () => {
    const employee = buildHelpMessages("EMPLOYEE", "users and roles")
      .find((m) => m.role === "user")!.content;
    // Admin-only manual sections must be absent from an employee's prompt.
    expect(employee).not.toContain("Users & roles");
    expect(employee).not.toContain("User Management");
    expect(employee).not.toContain("Departments are derived");

    const admin = buildHelpMessages("ADMIN", "users and roles")
      .find((m) => m.role === "user")!.content;
    expect(admin).toContain("Users & roles");
  });
});

describe("retrieveMockAnswer — keyword retrieval fallback", () => {
  it("returns the most relevant section's points + its title as the source", () => {
    const r = retrieveMockAnswer("EMPLOYEE", "how do I submit an expense receipt");
    expect(r.sources).toEqual(["Submitting expenses"]);
    expect(r.answer).toContain("Submit Expense");
  });

  it("matches role-specific content (admin reimbursements)", () => {
    const r = retrieveMockAnswer("ADMIN", "mark an approved expense as paid");
    expect(r.sources).toEqual(["Expenses & reimbursements"]);
  });

  it("says the manual doesn't cover an unrelated question, with no sources", () => {
    const r = retrieveMockAnswer("EMPLOYEE", "quantum cryptography zzzqqq");
    expect(r.sources).toEqual([]);
    expect(r.answer).toMatch(/doesn't cover/i);
  });

  it("never surfaces an admin-only section to an employee", () => {
    // Even asking about an admin topic, an employee only gets their own scope.
    const r = retrieveMockAnswer("EMPLOYEE", "create and edit users roles");
    expect(r.sources).not.toContain("Users & roles");
  });
});
