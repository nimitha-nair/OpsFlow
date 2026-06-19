import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnalysisBreakdown } from "./AnalysisBreakdown";
import type { PerDocumentExtraction } from "../../types/expenseAnalysis";

function doc(over: Partial<PerDocumentExtraction>): PerDocumentExtraction {
  return {
    documentId: "d",
    vendorName: null,
    amount: null,
    transactionDate: null,
    currency: "INR",
    category: null,
    taxInformation: null,
    confidenceScore: 90,
    ...over,
  };
}

describe("AnalysisBreakdown", () => {
  it("renders a row per document and a combined total", () => {
    render(
      <AnalysisBreakdown
        documents={[
          doc({ documentId: "d1", vendorName: "Vendor A", amount: 1000 }),
          doc({ documentId: "d2", vendorName: "Vendor B", amount: 500 }),
        ]}
        currency="INR"
      />,
    );
    expect(screen.getByText(/Vendor A/)).toBeInTheDocument();
    expect(screen.getByText(/Vendor B/)).toBeInTheDocument();
    // Combined total = 1000 + 500
    expect(screen.getByText(/Combined/i)).toBeInTheDocument();
    expect(screen.getByText(/1,500/)).toBeInTheDocument();
  });

  it("renders nothing for a single document", () => {
    const { container } = render(
      <AnalysisBreakdown documents={[doc({ amount: 100 })]} currency="INR" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
