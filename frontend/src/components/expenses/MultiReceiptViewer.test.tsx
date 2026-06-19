import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { MultiReceiptViewer } from "./MultiReceiptViewer";
import type { ExpenseFileView } from "../../types/expense";

vi.mock("../../lib/expenses-api", () => ({
  listExpenseDocuments: vi.fn(),
}));
// ReceiptViewer pulls in pdfjs; stub it to a marker for these tests.
vi.mock("./ReceiptViewer", () => ({
  ReceiptViewer: ({ documentId }: { documentId?: string }) => (
    <div data-testid="viewer">viewing {documentId}</div>
  ),
}));

import { listExpenseDocuments } from "../../lib/expenses-api";

function doc(id: string, name: string): ExpenseFileView {
  return {
    id,
    expenseId: "e1",
    fileName: `${id}.jpg`,
    originalFileName: name,
    mimeType: "image/jpeg",
    fileSize: 100,
    uploadedBy: "u1",
    uploadedAt: "2026-06-19T00:00:00Z",
    url: `/x/${id}`,
  };
}

describe("MultiReceiptViewer", () => {
  it("shows a switcher and document position for multiple documents", async () => {
    vi.mocked(listExpenseDocuments).mockResolvedValue([
      doc("d1", "first.jpg"),
      doc("d2", "second.jpg"),
    ]);
    render(<MultiReceiptViewer expenseId="e1" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /first\.jpg/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /second\.jpg/i })).toBeInTheDocument();
    expect(screen.getByText(/document 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByTestId("viewer")).toHaveTextContent("d1");
  });

  it("hides the switcher for a single document", async () => {
    vi.mocked(listExpenseDocuments).mockResolvedValue([doc("d1", "only.jpg")]);
    render(<MultiReceiptViewer expenseId="e1" />);
    await waitFor(() => expect(screen.getByTestId("viewer")).toBeInTheDocument());
    expect(screen.queryByText(/document 1 of/i)).not.toBeInTheDocument();
  });
});
