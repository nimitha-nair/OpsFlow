import { describe, expect, it } from "vitest";

import { isFirestoreQuotaError } from "./firestore";

describe("isFirestoreQuotaError", () => {
  it("matches quota / unavailable / deadline gRPC codes", () => {
    expect(isFirestoreQuotaError({ code: 8 })).toBe(true); // RESOURCE_EXHAUSTED
    expect(isFirestoreQuotaError({ code: 14 })).toBe(true); // UNAVAILABLE
    expect(isFirestoreQuotaError({ code: 4 })).toBe(true); // DEADLINE_EXCEEDED
  });

  it("ignores unrelated errors", () => {
    expect(isFirestoreQuotaError({ code: 5 })).toBe(false); // NOT_FOUND
    expect(isFirestoreQuotaError(new Error("boom"))).toBe(false);
    expect(isFirestoreQuotaError(null)).toBe(false);
    expect(isFirestoreQuotaError(undefined)).toBe(false);
  });
});
