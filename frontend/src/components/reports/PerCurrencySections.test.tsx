import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PerCurrencySections } from "./PerCurrencySections";
import { CurrencyScope } from "./CurrencyScope";

describe("PerCurrencySections", () => {
  it("renders content bare (no heading) for a single currency", () => {
    render(
      <PerCurrencySections currencies={["INR"]}>
        {(c) => <div>section-{c}</div>}
      </PerCurrencySections>,
    );
    expect(screen.getByText("section-INR")).toBeInTheDocument();
    // The bare single-currency path has no currency heading chip.
    expect(screen.queryByText("INR", { selector: "span" })).toBeNull();
  });

  it("renders a titled section per currency when several are selected", () => {
    render(
      <PerCurrencySections currencies={["INR", "USD", "EUR"]}>
        {(c) => <div>body-{c}</div>}
      </PerCurrencySections>,
    );
    for (const c of ["INR", "USD", "EUR"]) {
      expect(screen.getByText(c)).toBeInTheDocument();
      expect(screen.getByText(`body-${c}`)).toBeInTheDocument();
    }
  });
});

describe("CurrencyScope (multi-select)", () => {
  const totals = [
    { currency: "INR", count: 3, amount: 5000 },
    { currency: "USD", count: 2, amount: 600 },
    { currency: "EUR", count: 1, amount: 200 },
  ];

  it("Select all selects every currency", () => {
    const onChange = vi.fn();
    render(<CurrencyScope totals={totals} selected={["INR"]} onChange={onChange} />);
    screen.getByText("Select all").click();
    expect(onChange).toHaveBeenCalledWith(["INR", "USD", "EUR"]);
  });

  it("Clear all resets to the dominant currency (never empty)", () => {
    const onChange = vi.fn();
    render(<CurrencyScope totals={totals} selected={["INR", "USD"]} onChange={onChange} />);
    screen.getByText("Clear all").click();
    expect(onChange).toHaveBeenCalledWith(["INR"]);
  });

  it("toggling a currency off keeps the order and never empties", () => {
    const onChange = vi.fn();
    render(<CurrencyScope totals={totals} selected={["INR", "USD"]} onChange={onChange} />);
    screen.getByRole("button", { name: /USD/ }).click();
    expect(onChange).toHaveBeenCalledWith(["INR"]);
  });

  it("shows a static chip when only one currency is present", () => {
    const onChange = vi.fn();
    render(
      <CurrencyScope
        totals={[{ currency: "INR", count: 1, amount: 10 }]}
        selected={["INR"]}
        onChange={onChange}
      />,
    );
    expect(screen.queryByText("Select all")).toBeNull();
  });
});
