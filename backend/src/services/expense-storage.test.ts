import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  EXPENSE_UPLOAD_DIR,
  firebaseObjectName,
  getExpenseStorage,
  getStorageBackend,
  localFilePath,
} from "./expense-storage";

afterEach(() => {
  delete process.env.STORAGE_BACKEND;
});

describe("getStorageBackend", () => {
  it("defaults to local", () => {
    delete process.env.STORAGE_BACKEND;
    expect(getStorageBackend()).toBe("local");
  });

  it("selects firebase only for the exact value", () => {
    process.env.STORAGE_BACKEND = "firebase";
    expect(getStorageBackend()).toBe("firebase");
    process.env.STORAGE_BACKEND = "LOCAL";
    expect(getStorageBackend()).toBe("local");
    process.env.STORAGE_BACKEND = "s3";
    expect(getStorageBackend()).toBe("local");
  });
});

describe("path helpers", () => {
  it("maps a filename to each backend's stored path", () => {
    expect(localFilePath("expense_1.jpg")).toBe("uploads/expenses/expense_1.jpg");
    expect(firebaseObjectName("expense_1.jpg")).toBe("expenses/expense_1.jpg");
  });
});

describe("local backend round-trip", () => {
  async function seedFile(): Promise<{ fileName: string; bytes: Buffer }> {
    await mkdir(EXPENSE_UPLOAD_DIR, { recursive: true });
    const fileName = `test_${randomBytes(6).toString("hex")}.jpg`;
    const bytes = Buffer.from("receipt-bytes-" + fileName);
    // Emulate multer having written the upload into the upload dir.
    await writeFile(join(EXPENSE_UPLOAD_DIR, fileName), bytes);
    return { fileName, bytes };
  }

  async function collect(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }

  it("commits, reads, streams, then removes", async () => {
    const storage = getExpenseStorage();
    const { fileName, bytes } = await seedFile();

    const filePath = await storage.commit(fileName, "image/jpeg");
    expect(filePath).toBe(`uploads/expenses/${fileName}`);

    expect(await storage.read(filePath)).toEqual(bytes);
    expect(await collect(storage.stream(filePath))).toEqual(bytes);

    await storage.remove(filePath);
    await expect(storage.read(filePath)).rejects.toThrow();
  });

  it("remove is best-effort for a missing file", async () => {
    const storage = getExpenseStorage();
    await expect(
      storage.remove("uploads/expenses/does-not-exist.jpg"),
    ).resolves.toBeUndefined();
  });
});
