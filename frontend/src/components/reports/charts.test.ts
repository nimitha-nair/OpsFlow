import { describe, expect, it } from "vitest";

import { donutArcs } from "./donut-geometry";

const C = 100; // easy circumference for percentage-like dash maths

describe("donutArcs", () => {
  it("lays segments head-to-tail with dashes summing to the circumference", () => {
    const arcs = donutArcs(
      [
        { label: "A", value: 50 },
        { label: "B", value: 30 },
        { label: "C", value: 20 },
      ],
      C,
    );
    expect(arcs.map((a) => a.dash)).toEqual([50, 30, 20]);
    // offsets place each arc after the previous ones (negative cumulative).
    expect(arcs.map((a) => a.offset)).toEqual([-0, -50, -80]);
    expect(arcs.reduce((s, a) => s + a.dash, 0)).toBeCloseTo(C);
  });

  it("computes percent share to one decimal", () => {
    const arcs = donutArcs(
      [
        { label: "A", value: 1 },
        { label: "B", value: 2 },
      ],
      C,
    );
    expect(arcs.map((a) => a.percent)).toEqual([33.3, 66.7]);
  });

  it("drops non-positive segments", () => {
    const arcs = donutArcs(
      [
        { label: "A", value: 10 },
        { label: "Zero", value: 0 },
        { label: "Neg", value: -5 },
      ],
      C,
    );
    expect(arcs.map((a) => a.label)).toEqual(["A"]);
    expect(arcs[0]!.dash).toBeCloseTo(C);
  });

  it("returns [] when nothing is positive", () => {
    expect(donutArcs([{ label: "A", value: 0 }], C)).toEqual([]);
    expect(donutArcs([], C)).toEqual([]);
  });

  it("assigns distinct cycling accents when none are specified", () => {
    const arcs = donutArcs(
      [
        { label: "A", value: 1 },
        { label: "B", value: 1 },
      ],
      C,
    );
    expect(arcs[0]!.accent).not.toBe(arcs[1]!.accent);
  });

  it("honors an explicit accent", () => {
    const arcs = donutArcs([{ label: "A", value: 1, accent: "rose" }], C);
    expect(arcs[0]!.accent).toBe("rose");
  });
});
