import { describe, expect, it } from "vitest";
import { isPdf } from "./document-image";

describe("isPdf", () => {
  it("detects PDF mime types", () => {
    expect(isPdf("application/pdf")).toBe(true);
  });
  it("is false for images", () => {
    expect(isPdf("image/png")).toBe(false);
    expect(isPdf("image/webp")).toBe(false);
  });
});
