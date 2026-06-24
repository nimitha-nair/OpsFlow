import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActiveRangeBadge } from "./ActiveRangeBadge";
import { makeRange } from "@/lib/date-range";

afterEach(cleanup);

describe("ActiveRangeBadge", () => {
  it("shows the active preset label", () => {
    render(<ActiveRangeBadge range={makeRange("30d")} />);
    expect(screen.getByTestId("active-range-badge")).toHaveTextContent(
      "Last 30 days",
    );
  });

  it("shows a custom range's formatted dates", () => {
    render(
      <ActiveRangeBadge range={makeRange("custom", "2026-01-01", "2026-03-31")} />,
    );
    expect(screen.getByTestId("active-range-badge")).toHaveTextContent(
      "1 Jan 2026 – 31 Mar 2026",
    );
  });
});
