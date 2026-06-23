import { describe, expect, it } from "vitest";

import { fuzzyMatch, fuzzyMatchAny } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches an empty query", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });

  it("matches a case-insensitive substring", () => {
    expect(fuzzyMatch("AUTH", "refactor auth flow")).toBe(true);
  });

  it("matches a subsequence", () => {
    expect(fuzzyMatch("raf", "refactor auth flow")).toBe(true);
    expect(fuzzyMatch("tsk", "the task")).toBe(true);
  });

  it("rejects characters out of order", () => {
    expect(fuzzyMatch("flowauth", "refactor auth flow")).toBe(false);
  });

  it("rejects missing characters", () => {
    expect(fuzzyMatch("xyz", "refactor auth flow")).toBe(false);
  });
});

describe("fuzzyMatchAny", () => {
  it("matches across multiple fields, ignoring undefined", () => {
    expect(fuzzyMatchAny("alice", ["Bug fix", undefined, "Alice"])).toBe(true);
    expect(fuzzyMatchAny("zzz", ["Bug fix", "Alice"])).toBe(false);
  });
});
