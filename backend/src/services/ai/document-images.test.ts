import { describe, expect, it, vi } from "vitest";

import { capImages } from "./document-images";

describe("capImages", () => {
  it("flattens per-doc images in order", () => {
    expect(capImages([["a", "b"], ["c"]])).toEqual(["a", "b", "c"]);
  });
  it("caps the total and warns when dropping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = capImages(
      [
        ["a", "b", "c"],
        ["d", "e", "f"],
      ],
      4,
    );
    expect(out).toEqual(["a", "b", "c", "d"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("returns everything when under the cap", () => {
    expect(capImages([["a"], ["b"]], 8)).toEqual(["a", "b"]);
  });
});
