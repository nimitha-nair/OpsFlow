import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./document-image", () => ({
  toKimiImageDataUri: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
}));

import { kimiExtractor } from "./kimi-extractor";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;
  delete process.env.NVIDIA_API_KEY;
});

function mockFetchOnceWithContent(content: string) {
  const json = { choices: [{ message: { content } }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => json }) as unknown as Response),
  );
}

interface ChatMessage {
  role: string;
  content: unknown;
}

describe("kimiExtractor", () => {
  it("sends an image_url message and parses JSON content", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    mockFetchOnceWithContent(
      JSON.stringify({ vendorName: "Uber", amount: 450, confidenceScore: 90 }),
    );
    const r = await kimiExtractor.extract({ expenseId: "e1", documentId: "d1" });
    expect(r.vendorName).toBe("Uber");
    expect(r.amount).toBe(450);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: ChatMessage[];
    };
    expect(body.model).toBe("moonshotai/kimi-k2.6");
    const userMsg = body.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toContainEqual(
      expect.objectContaining({ type: "image_url" }),
    );
    expect(init.headers).toMatchObject({
      Authorization: "Bearer nvapi-test",
    });
  });

  it("throws when NVIDIA returns a non-OK status", async () => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" }) as unknown as Response),
    );
    await expect(
      kimiExtractor.extract({ expenseId: "e1", documentId: "d1" }),
    ).rejects.toThrow();
  });

  it("throws when no API key is configured", async () => {
    await expect(
      kimiExtractor.extract({ expenseId: "e1", documentId: "d1" }),
    ).rejects.toThrow(/NVIDIA_API_KEY/);
  });
});
