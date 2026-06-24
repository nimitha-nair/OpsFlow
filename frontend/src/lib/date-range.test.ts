import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  makeRange,
  inRange,
  filterByDate,
  monthsToParams,
  rangeToMonths,
  rangeToParams,
  rangeLabel,
  rangeSlug,
} from "./date-range";

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

describe("monthsToParams", () => {
  it("returns both from and to", () => {
    const p = monthsToParams(3);
    expect(p.from).toBeDefined();
    expect(p.to).toBeDefined();
  });

  it("from is earlier than to", () => {
    const p = monthsToParams(3);
    expect(new Date(p.from).getTime()).toBeLessThan(new Date(p.to).getTime());
  });

  it("for months=3 the span is roughly 3 months (80–100 days)", () => {
    const p = monthsToParams(3);
    const days =
      (new Date(p.to).getTime() - new Date(p.from).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(80);
    expect(days).toBeLessThan(100);
  });
});

describe("rangeToParams", () => {
  it("omits both bounds for all-time", () => {
    expect(rangeToParams(makeRange("all"))).toEqual({});
  });

  it("emits UTC day-edge ISO from/to for a bounded custom range", () => {
    const r = makeRange("custom", "2026-01-01", "2026-03-31");
    const p = rangeToParams(r);
    expect(p.from).toBe("2026-01-01T00:00:00.000Z");
    expect(p.to).toBe("2026-03-31T23:59:59.999Z");
  });

  it("output always ends in Z (UTC) for a bounded range", () => {
    const r = makeRange("custom", "2026-01-01", "2026-03-31");
    const p = rangeToParams(r);
    expect(p.from).toMatch(/Z$/);
    expect(p.to).toMatch(/Z$/);
  });

  it("omits the missing bound of a half-open custom range", () => {
    const r = makeRange("custom", "2026-01-01", undefined);
    const p = rangeToParams(r);
    expect(p.from).toBeDefined();
    expect(p.to).toBeUndefined();
  });
});

describe("rangeLabel", () => {
  it("uses the preset label for non-custom ranges", () => {
    expect(rangeLabel(makeRange("30d"))).toBe("Last 30 days");
    expect(rangeLabel(makeRange("all"))).toBe("All time");
  });

  it("formats a custom range with both bounds", () => {
    expect(rangeLabel(makeRange("custom", "2026-01-01", "2026-03-31"))).toBe(
      "1 Jan 2026 – 31 Mar 2026",
    );
  });

  it("falls back to 'Custom range' when bounds are missing", () => {
    expect(rangeLabel(makeRange("custom"))).toBe("Custom range");
  });
});

describe("rangeSlug", () => {
  it("slugs presets", () => {
    expect(rangeSlug(makeRange("30d"))).toBe("last-30-days");
    expect(rangeSlug(makeRange("all"))).toBe("all-time");
  });

  it("slugs a custom range by its dates", () => {
    expect(rangeSlug(makeRange("custom", "2026-01-01", "2026-03-31"))).toBe(
      "2026-01-01_2026-03-31",
    );
  });
});
