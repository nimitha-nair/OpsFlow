import { describe, expect, it } from "vitest";
import { filterByDateWindow, withinIsoRange } from "./date-window";

const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2026-01-31T23:59:59.999Z";

describe("withinIsoRange", () => {
  it("returns true when both bounds are absent", () => {
    expect(withinIsoRange("2020-05-05", undefined, undefined)).toBe(true);
  });
  it("includes a string date inside the window (inclusive)", () => {
    expect(withinIsoRange("2026-01-15", FROM, TO)).toBe(true);
    expect(withinIsoRange("2026-02-01", FROM, TO)).toBe(false);
  });
  it("handles a Firestore-like Timestamp via toMillis", () => {
    const ts = { toMillis: () => Date.parse("2026-01-10") };
    expect(withinIsoRange(ts, FROM, TO)).toBe(true);
  });
  it("excludes unparseable values", () => {
    expect(withinIsoRange("nope", FROM, TO)).toBe(false);
    expect(withinIsoRange(null, FROM, TO)).toBe(false);
  });
});

describe("filterByDateWindow", () => {
  const rows = [{ d: "2026-01-10" }, { d: "2026-02-10" }];
  it("returns the same array when unbounded", () => {
    expect(filterByDateWindow(rows, (r) => r.d, undefined, undefined)).toBe(rows);
  });
  it("filters to the window", () => {
    expect(filterByDateWindow(rows, (r) => r.d, FROM, TO)).toEqual([
      { d: "2026-01-10" },
    ]);
  });
});
