import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mocked so the helper reads a real on-disk temp image we control. `read()`
// returns the bytes (the resolver is now backend-agnostic — no absolutePath).
const resolved = { absolutePath: "", mimeType: "image/webp", originalFileName: "r.webp" };
vi.mock("../expense-document.service", () => ({
  resolveExpenseDocumentFile: vi.fn(async () => ({
    mimeType: resolved.mimeType,
    originalFileName: resolved.originalFileName,
    read: async () => readFile(resolved.absolutePath),
    stream: () => ({}) as unknown,
  })),
}));

import { toKimiImageDataUri } from "./document-image";

let dir = "";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "opsflow-img-"));
  // A genuine WebP (a format Kimi does NOT accept) to prove transcoding works.
  const webp = await sharp({
    create: { width: 40, height: 30, channels: 3, background: "#3366cc" },
  })
    .webp()
    .toBuffer();
  resolved.absolutePath = join(dir, "receipt.webp");
  await writeFile(resolved.absolutePath, webp);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("toKimiImageDataUri (image path)", () => {
  it("transcodes a webp document to a JPEG data URI", async () => {
    const uri = await toKimiImageDataUri("doc-1");
    expect(uri.startsWith("data:image/jpeg;base64,")).toBe(true);

    const b64 = uri.slice("data:image/jpeg;base64,".length);
    const bytes = Buffer.from(b64, "base64");
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("jpeg"); // webp was transcoded to JPEG
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("downscales an oversized image to <= 1600px on the long edge", async () => {
    const bigPath = join(dir, "big.png");
    const big = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    await writeFile(bigPath, big);
    resolved.absolutePath = bigPath;
    resolved.mimeType = "image/png";

    const uri = await toKimiImageDataUri("doc-2");
    const bytes = Buffer.from(uri.slice("data:image/jpeg;base64,".length), "base64");
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);
  });
});
