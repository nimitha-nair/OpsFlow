import { describe, expect, it } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, nextZoom } from "./viewer-zoom";

describe("nextZoom", () => {
  it("steps up and down by a fixed increment", () => {
    expect(nextZoom(1, "in")).toBeCloseTo(1.25);
    expect(nextZoom(1, "out")).toBeCloseTo(0.75);
  });
  it("clamps at the maximum", () => {
    expect(nextZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
  });
  it("clamps at the minimum", () => {
    expect(nextZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
  });
});
