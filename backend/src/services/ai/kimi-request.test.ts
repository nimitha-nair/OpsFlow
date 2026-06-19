import { describe, expect, it } from "vitest";

import { buildKimiMessages } from "./kimi-request";

describe("buildKimiMessages", () => {
  it("adds one image part per data URI plus a single text part", () => {
    const msgs = buildKimiMessages([
      "data:image/jpeg;base64,A",
      "data:image/jpeg;base64,B",
    ]);
    const user = msgs.find((m) => m.role === "user")!;
    const parts = user.content as Array<{ type: string }>;
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(parts.filter((p) => p.type === "text")).toHaveLength(1);
  });

  it("includes a system prompt", () => {
    const msgs = buildKimiMessages(["data:image/jpeg;base64,A"]);
    expect(msgs[0]?.role).toBe("system");
    expect(typeof msgs[0]?.content).toBe("string");
  });
});
