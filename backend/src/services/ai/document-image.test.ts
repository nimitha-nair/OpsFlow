import { describe, expect, it } from "vitest";
import sharp from "sharp";

import { bytesToKimiJpegDataUris, isPdf } from "./document-image";

describe("isPdf", () => {
  it("detects PDF mime types", () => {
    expect(isPdf("application/pdf")).toBe(true);
  });
  it("is false for images", () => {
    expect(isPdf("image/png")).toBe(false);
    expect(isPdf("image/webp")).toBe(false);
  });
});

describe("bytesToKimiJpegDataUris", () => {
  it("returns a single JPEG data URI for an image", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    const uris = await bytesToKimiJpegDataUris(png, "image/png");
    expect(uris).toHaveLength(1);
    expect(uris[0]).toMatch(/^data:image\/jpeg;base64,/);
  });
});
