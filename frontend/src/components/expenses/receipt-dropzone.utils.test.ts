import { describe, expect, it } from "vitest";

import {
  MAX_BYTES,
  MAX_FILES,
  validateFiles,
} from "./receipt-dropzone.utils";

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateFiles", () => {
  it("rejects unsupported types", () => {
    const r = validateFiles([file("a.txt", "text/plain", 10)], 0);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors[0]).toMatch(/type/i);
  });

  it("rejects files over 5 MB", () => {
    const r = validateFiles([file("a.jpg", "image/jpeg", MAX_BYTES + 1)], 0);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors[0]).toMatch(/large/i);
  });

  it("accepts valid files", () => {
    const r = validateFiles([file("a.jpg", "image/jpeg", 1000)], 0);
    expect(r.accepted).toHaveLength(1);
    expect(r.errors).toHaveLength(0);
  });

  it("caps the total at MAX_FILES, accounting for existing", () => {
    const many = Array.from({ length: MAX_FILES + 1 }, (_, i) =>
      file(`a${i}.jpg`, "image/jpeg", 10),
    );
    const r = validateFiles(many, 0);
    expect(r.accepted).toHaveLength(MAX_FILES);
    expect(r.errors.some((e) => /max/i.test(e))).toBe(true);
  });

  it("respects already-attached count", () => {
    const r = validateFiles([file("a.jpg", "image/jpeg", 10)], MAX_FILES);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors.some((e) => /max/i.test(e))).toBe(true);
  });
});
