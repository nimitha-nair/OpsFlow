import { describe, expect, it } from "vitest";

import {
  monthAxisLabel,
  monthAxisLabels,
  monthFull,
  monthShort,
} from "./month-format";

describe("monthShort", () => {
  it("renders a short month name", () => {
    expect(monthShort("2026-06")).toBe("Jun");
    expect(monthShort("2026-01")).toBe("Jan");
  });
  it("falls back to the raw key on bad input", () => {
    expect(monthShort("nope")).toBe("nope");
    expect(monthShort("2026-13")).toBe("2026-13");
  });
});

describe("monthFull", () => {
  it("renders full month + year for tooltips", () => {
    expect(monthFull("2026-06")).toBe("June 2026");
  });
});

describe("monthAxisLabel", () => {
  it("shows the year on the first bucket (no prev)", () => {
    expect(monthAxisLabel("2026-06")).toBe("Jun ’26");
  });
  it("omits the year within the same year", () => {
    expect(monthAxisLabel("2026-02", "2026-01")).toBe("Feb");
  });
  it("shows the year at a year boundary", () => {
    expect(monthAxisLabel("2026-01", "2025-12")).toBe("Jan ’26");
  });
});

describe("monthAxisLabels", () => {
  it("only repeats the year at boundaries across a multi-year span", () => {
    expect(
      monthAxisLabels(["2025-11", "2025-12", "2026-01", "2026-02"]),
    ).toEqual(["Nov ’25", "Dec", "Jan ’26", "Feb"]);
  });
});
