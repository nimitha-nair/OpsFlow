import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MoneyTotals } from "./MoneyTotals";

describe("MoneyTotals", () => {
  it("renders a single total without the multi-currency badge", () => {
    render(<MoneyTotals totals={[{ currency: "INR", count: 2, amount: 50000 }]} />);
    expect(screen.queryByText(/multiple currencies/i)).toBeNull();
    expect(screen.getByText(/₹|50,000|50000/)).toBeInTheDocument();
  });

  it("renders a grouped breakdown + badge for multiple currencies", () => {
    render(
      <MoneyTotals
        totals={[
          { currency: "INR", count: 1, amount: 50000 },
          { currency: "USD", count: 1, amount: 600 },
        ]}
      />,
    );
    expect(screen.getByText(/multiple currencies/i)).toBeInTheDocument();
  });

  it("renders a zero when there are no totals", () => {
    const { container } = render(<MoneyTotals totals={[]} />);
    expect(container.textContent).toMatch(/0/);
  });
});
