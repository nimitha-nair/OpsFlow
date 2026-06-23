import { describe, expect, it } from "vitest";

import { formatCode, parseCode } from "./code-format";

describe("formatCode", () => {
  it("formats each entity with its prefix and padding", () => {
    expect(formatCode("expense", 1)).toBe("EXP-0001");
    expect(formatCode("project", 1)).toBe("PRJ-001");
    expect(formatCode("task", 1)).toBe("TSK-001");
  });

  it("pads to the minimum width", () => {
    expect(formatCode("expense", 42)).toBe("EXP-0042");
    expect(formatCode("project", 100)).toBe("PRJ-100");
  });

  it("does not truncate numbers larger than the pad width", () => {
    expect(formatCode("project", 12345)).toBe("PRJ-12345");
  });
});

describe("parseCode", () => {
  it("round-trips a formatted code", () => {
    for (const entity of ["expense", "project", "task"] as const) {
      const parsed = parseCode(formatCode(entity, 7));
      expect(parsed).toEqual({ entity, n: 7 });
    }
  });

  it("is case-insensitive and trims", () => {
    expect(parseCode("  exp-0009 ")).toEqual({ entity: "expense", n: 9 });
  });

  it("returns null for malformed or unknown codes", () => {
    expect(parseCode("nonsense")).toBeNull();
    expect(parseCode("ZZZ-001")).toBeNull();
    expect(parseCode("EXP-")).toBeNull();
    expect(parseCode("EXP001")).toBeNull();
  });
});
