import { describe, it, expect } from "vitest";

import { taskStatusBody } from "./task.schema";

describe("taskStatusBody", () => {
  it("requires a reason when moving a task to ON_HOLD", () => {
    expect(taskStatusBody.safeParse({ status: "ON_HOLD" }).success).toBe(false);
    expect(
      taskStatusBody.safeParse({ status: "ON_HOLD", reason: "  " }).success,
    ).toBe(false);
    expect(
      taskStatusBody.safeParse({ status: "ON_HOLD", reason: "Blocked on design" })
        .success,
    ).toBe(true);
  });

  it("accepts other statuses without a reason", () => {
    for (const status of ["IN_PROGRESS", "REVIEW", "DONE", "TODO"]) {
      expect(taskStatusBody.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects unknown statuses", () => {
    expect(taskStatusBody.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });
});
