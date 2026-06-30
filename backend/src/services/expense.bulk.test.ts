import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./expense.service", () => ({
  createExpense: vi.fn(),
  addExpenseDocumentId: vi.fn(),
}));
vi.mock("./expense-document.service", () => ({
  saveExpenseDocument: vi.fn(),
}));

import { createBulkDrafts } from "./expense.bulk";
import { createExpense, addExpenseDocumentId } from "./expense.service";
import { saveExpenseDocument } from "./expense-document.service";

const createExpenseMock = vi.mocked(createExpense);
const saveDocMock = vi.mocked(saveExpenseDocument);
const addDocIdMock = vi.mocked(addExpenseDocumentId);

beforeEach(() => {
  vi.clearAllMocks();
  createExpenseMock.mockImplementation(async () => ({ id: "exp1" }) as never);
  saveDocMock.mockImplementation(async () => ({ id: "doc1" }) as never);
  addDocIdMock.mockResolvedValue(undefined as never);
});

const files = [
  { filename: "a.jpg", originalname: "a.jpg", mimetype: "image/jpeg", size: 10 },
  { filename: "b.jpg", originalname: "b.jpg", mimetype: "image/jpeg", size: 20 },
];

describe("createBulkDrafts", () => {
  it("creates one DRAFT expense per file and attaches the file", async () => {
    const r = await createBulkDrafts(
      { employeeId: "e1", scope: "GENERAL", currency: "INR" }, files,
    );
    expect(createExpenseMock).toHaveBeenCalledTimes(2);
    expect(createExpenseMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "e1", isDraft: true, type: "DOCUMENT" }),
    );
    expect(saveDocMock).toHaveBeenCalledTimes(2);
    expect(addDocIdMock).toHaveBeenCalledTimes(2);
    expect(r.created).toHaveLength(2);
    expect(r.failed).toHaveLength(0);
  });

  it("isolates a per-file failure without aborting the batch", async () => {
    createExpenseMock
      .mockImplementationOnce(async () => ({ id: "exp1" }) as never)
      .mockImplementationOnce(async () => { throw new Error("boom"); });
    const r = await createBulkDrafts(
      { employeeId: "e1", scope: "GENERAL", currency: "INR" }, files,
    );
    expect(r.created).toHaveLength(1);
    expect(r.failed).toEqual([{ fileName: "b.jpg", error: "boom" }]);
  });
});
