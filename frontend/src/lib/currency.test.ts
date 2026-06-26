import { describe, expect, it } from "vitest";

import { normalizeCurrency, pickActiveCurrency, totalsByCurrency } from "./currency";

describe("normalizeCurrency", () => {
  it("uppercases, trims, and defaults blank/non-string to INR", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("inr")).toBe("INR");
    expect(normalizeCurrency("")).toBe("INR");
    expect(normalizeCurrency(undefined)).toBe("INR");
    expect(normalizeCurrency(null)).toBe("INR");
  });
});

describe("totalsByCurrency", () => {
  it("tallies count + amount per currency, descending by amount", () => {
    expect(
      totalsByCurrency([
        { currency: "INR", amount: 100 },
        { currency: "usd", amount: 50 },
        { currency: "INR", amount: 200 },
        { currency: "USD", amount: 25 },
        { currency: undefined, amount: 10 },
      ]),
    ).toEqual([
      { currency: "INR", count: 3, amount: 310 },
      { currency: "USD", count: 2, amount: 75 },
    ]);
  });

  it("breaks amount ties by currency code ascending", () => {
    expect(
      totalsByCurrency([
        { currency: "USD", amount: 100 },
        { currency: "EUR", amount: 100 },
      ]).map((t) => t.currency),
    ).toEqual(["EUR", "USD"]);
  });

  it("returns an empty array for no rows", () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});

describe("pickActiveCurrency", () => {
  const totals = [
    { currency: "INR", count: 3, amount: 310 },
    { currency: "USD", count: 2, amount: 75 },
  ];

  it("honors a requested currency that has data", () => {
    expect(pickActiveCurrency(totals, "usd")).toBe("USD");
  });

  it("falls back to the dominant currency when absent/unknown", () => {
    expect(pickActiveCurrency(totals)).toBe("INR");
    expect(pickActiveCurrency(totals, "GBP")).toBe("INR");
  });

  it("falls back to INR when there is no data at all", () => {
    expect(pickActiveCurrency([], "USD")).toBe("INR");
  });
});
