import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeRange, inRange, filterByDate, rangeToMonths } from "./date-range";

const NOW = new Date("2026-06-22T12:00:00.000Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("makeRange", () => {
  it("returns unbounded for 'all'", () => {
    const r = makeRange("all");
    expect(r.fromMs).toBeNull();
    expect(r.toMs).toBeNull();
  });

  it("bounds 'today' to the current day", () => {
    const r = makeRange("today");
    expect(r.fromMs).not.toBeNull();
    expect(r.toMs).not.toBeNull();
    expect(r.toMs! - r.fromMs!).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it("'7d' spans roughly seven days", () => {
    const r = makeRange("7d");
    const days = (r.toMs! - r.fromMs!) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6);
    expect(days).toBeLessThan(8);
  });

  it("parses a custom range inclusively", () => {
    const r = makeRange("custom", "2026-01-01", "2026-01-31");
    expect(r.fromMs).not.toBeNull();
    expect(r.toMs).not.toBeNull();
    // End is inclusive end-of-day, so the span exceeds 29 full days.
    expect(r.toMs! - r.fromMs!).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it("treats a custom range with no dates as unbounded", () => {
    const r = makeRange("custom");
    expect(r.fromMs).toBeNull();
    expect(r.toMs).toBeNull();
  });
});

describe("inRange / filterByDate", () => {
  it("includes everything when unbounded", () => {
    expect(inRange("2020-01-01", makeRange("all"))).toBe(true);
  });

  it("excludes dates outside the window", () => {
    const r = makeRange("30d");
    expect(inRange("2026-06-20", r)).toBe(true);
    expect(inRange("2026-01-01", r)).toBe(false);
  });

  it("excludes invalid/missing dates when bounded", () => {
    const r = makeRange("30d");
    expect(inRange(undefined, r)).toBe(false);
    expect(inRange("not-a-date", r)).toBe(false);
  });

  it("filters a list by a date accessor", () => {
    const items = [
      { id: "a", d: "2026-06-21" },
      { id: "b", d: "2026-03-01" },
      { id: "c", d: "2026-06-10" },
    ];
    const r = makeRange("30d");
    expect(filterByDate(items, (i) => i.d, r).map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("returns the same array reference when unbounded (no copy)", () => {
    const items = [{ d: "x" }];
    expect(filterByDate(items, (i) => i.d, makeRange("all"))).toBe(items);
  });
});

describe("rangeToMonths", () => {
  it("returns 24 for unbounded", () => {
    expect(rangeToMonths(makeRange("all"))).toBe(24);
  });

  it("maps shorter presets to fewer months", () => {
    expect(rangeToMonths(makeRange("quarter"))).toBeLessThanOrEqual(4);
    expect(rangeToMonths(makeRange("year"))).toBeLessThanOrEqual(13);
    expect(rangeToMonths(makeRange("today"))).toBe(1);
  });
});
