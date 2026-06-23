import { describe, expect, it } from "vitest";

import { extractMentionIds, splitMentions } from "./mentions";

const members = [
  { id: "u1", name: "Alice Smith" },
  { id: "u2", name: "Bob" },
];

describe("extractMentionIds", () => {
  it("resolves full-name and single-name mentions", () => {
    expect(extractMentionIds("hey @Alice Smith and @Bob", members).sort()).toEqual([
      "u1",
      "u2",
    ]);
  });

  it("ignores unknown mentions", () => {
    expect(extractMentionIds("@Carol hi", members)).toEqual([]);
  });
});

describe("splitMentions", () => {
  it("marks a known member mention", () => {
    const segs = splitMentions("hi @Bob!", ["Alice Smith", "Bob"]);
    expect(segs.some((s) => s.mention && s.text === "@Bob")).toBe(true);
  });

  it("highlights a generic @token even without known members", () => {
    const segs = splitMentions("@someone hi", []);
    expect(segs[0]).toEqual({ text: "@someone", mention: true });
  });
});
