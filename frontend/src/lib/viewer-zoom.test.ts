import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PRESETS,
  clampZoom,
  nextZoom,
  nudgeZoom,
  snapZoom,
} from "./viewer-zoom";

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

describe("snapZoom (discrete presets)", () => {
  it("steps up through the presets", () => {
    expect(snapZoom(1, "in")).toBe(1.25);
    expect(snapZoom(1.5, "in")).toBe(2);
    expect(snapZoom(2, "in")).toBe(3);
  });
  it("steps down through the presets", () => {
    expect(snapZoom(1, "out")).toBe(0.75);
    expect(snapZoom(0.75, "out")).toBe(0.5);
  });
  it("clamps at the ends", () => {
    expect(snapZoom(3, "in")).toBe(3);
    expect(snapZoom(0.5, "out")).toBe(0.5);
  });
  it("snaps from an off-preset value in the requested direction", () => {
    expect(snapZoom(1.1, "in")).toBe(1.25);
    expect(snapZoom(1.1, "out")).toBe(1);
  });
  it("exposes exactly the spec's levels (50–300%)", () => {
    expect(ZOOM_PRESETS.map((p) => Math.round(p * 100))).toEqual([
      50, 75, 100, 125, 150, 200, 300,
    ]);
  });
});

describe("clampZoom / nudgeZoom", () => {
  it("clamps to [MIN, MAX]", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });
  it("nudges by a fine delta within range", () => {
    expect(nudgeZoom(1, 0.1)).toBeCloseTo(1.1);
    expect(nudgeZoom(ZOOM_MAX, 0.5)).toBe(ZOOM_MAX);
  });
});
