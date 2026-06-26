import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ColumnChart, type ColumnItem } from "./charts";

const item = (over: Partial<ColumnItem>): ColumnItem => ({
  key: "k",
  ratio: 0.5,
  label: "Jun '26",
  title: "June 2026",
  ...over,
});

describe("ColumnChart adaptivity", () => {
  it("shows a single-value KPI (not a bar) when only one period exists", () => {
    render(
      <ColumnChart
        items={[item({ key: "2026-06", label: "Jun '26", valueText: "₹50,000" })]}
      />,
    );
    expect(screen.getByText("₹50,000")).toBeInTheDocument();
    expect(screen.getByText(/only one period/i)).toBeInTheDocument();
  });

  it("renders the trend columns when multiple periods exist", () => {
    render(
      <ColumnChart
        items={[
          item({ key: "2026-05", label: "May '26", valueText: "₹10" }),
          item({ key: "2026-06", label: "Jun '26", valueText: "₹20" }),
        ]}
      />,
    );
    // No single-period KPI; both period labels render on the axis.
    expect(screen.queryByText(/only one period/i)).toBeNull();
    expect(screen.getByText("May '26")).toBeInTheDocument();
    expect(screen.getByText("Jun '26")).toBeInTheDocument();
  });

  it("shows the empty state when there is no data", () => {
    render(<ColumnChart items={[]} />);
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument();
  });

  it("shows the empty state when every period is zero", () => {
    render(
      <ColumnChart
        items={[
          item({ key: "a", ratio: 0 }),
          item({ key: "b", ratio: 0 }),
        ]}
      />,
    );
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument();
  });
});
