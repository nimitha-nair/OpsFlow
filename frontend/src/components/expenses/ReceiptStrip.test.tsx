import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ReceiptStrip } from "./ReceiptStrip";
import type { ExpenseFileView } from "../../types/expense";

vi.mock("../../lib/expenses-api", () => ({
  listExpenseDocuments: vi.fn(),
  fetchExpenseDocByIdObjectUrl: vi.fn(async () => "blob:mock"),
}));

import {
  listExpenseDocuments,
  fetchExpenseDocByIdObjectUrl,
} from "../../lib/expenses-api";

beforeAll(() => {
  if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
});

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
    url: `/expenses/e1/documents/${id}/file`,
  };
}

describe("ReceiptStrip", () => {
  it("renders a thumbnail button per document", async () => {
    vi.mocked(listExpenseDocuments).mockResolvedValue([
      doc("d1", "first.jpg"),
      doc("d2", "second.jpg"),
    ]);
    render(<ReceiptStrip expenseId="e1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /first\.jpg/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /second\.jpg/i })).toBeInTheDocument();
    });
    // The selected document's bytes load in a follow-up effect — wait for it.
    await waitFor(() => expect(fetchExpenseDocByIdObjectUrl).toHaveBeenCalled());
  });
});
