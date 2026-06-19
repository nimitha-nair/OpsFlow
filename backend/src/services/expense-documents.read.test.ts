import { describe, expect, it } from "vitest";

import {
  deriveDocumentIds,
  sortByUploadedAtAsc,
} from "./expense-documents.read";

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

describe("sortByUploadedAtAsc", () => {
  it("orders oldest-first by ISO uploadedAt without mutating the input", () => {
    const input = [
      { id: "b", uploadedAt: "2026-06-10T10:00:00Z" },
      { id: "a", uploadedAt: "2026-06-10T09:00:00Z" },
      { id: "c", uploadedAt: "2026-06-10T11:00:00Z" },
    ];
    const sorted = sortByUploadedAtAsc(input);
    expect(sorted.map((x) => x.id)).toEqual(["a", "b", "c"]);
    // original untouched
    expect(input[0]!.id).toBe("b");
  });
});
