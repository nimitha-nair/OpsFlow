import { describe, expect, it } from "vitest";
import { dateRangeQuery } from "./common";

describe("dateRangeQuery", () => {
  it("accepts optional ISO from/to", () => {
    expect(dateRangeQuery.parse({})).toEqual({});
    const parsed = dateRangeQuery.parse({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-03-31T23:59:59.999Z",
    });
    expect(parsed.from).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.to).toBe("2026-03-31T23:59:59.999Z");
  });

  it("rejects a non-date from", () => {
    expect(() => dateRangeQuery.parse({ from: "not-a-date" })).toThrow();
  });
});
