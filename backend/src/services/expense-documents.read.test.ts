import { describe, expect, it } from "vitest";

import { deriveDocumentIds } from "./expense-documents.read";

describe("deriveDocumentIds", () => {
  it("prefers documentIds when present", () => {
    expect(deriveDocumentIds({ documentId: "a", documentIds: ["b", "c"] })).toEqual([
      "b",
      "c",
    ]);
  });
  it("falls back to the single documentId for legacy rows", () => {
    expect(deriveDocumentIds({ documentId: "a" })).toEqual(["a"]);
  });
  it("returns [] when there is no document", () => {
    expect(deriveDocumentIds({})).toEqual([]);
    expect(deriveDocumentIds({ documentIds: [] })).toEqual([]);
  });
});
