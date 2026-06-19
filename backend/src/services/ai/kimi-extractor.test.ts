import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./document-images", () => ({
  toKimiImageDataUrisForDocuments: vi.fn(async () => ["data:image/jpeg;base64,AAAA"]),
}));

import { kimiExtractor } from "./kimi-extractor";
import { RetryableExtractionError } from "./retry";
import { MalformedExtractionError } from "./extraction";

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

/** Stub fetch with an error response (status, optional Retry-After header). */
function mockFetchError(status: number, headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        ({
          ok: false,
          status,
          headers: { get: (k: string) => lower[k.toLowerCase()] ?? null },
          text: async () => `error ${status}`,
        }) as unknown as Response,
    ),
  );
}

/** Capture the error a rejected extract throws. */
async function extractError(): Promise<unknown> {
  process.env.NVIDIA_API_KEY = "nvapi-test";
  return kimiExtractor
    .extract({ expenseId: "e1", documentId: "d1" })
    .then(() => undefined)
    .catch((e) => e);
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

describe("kimiExtractor error classification", () => {
  it("429 WITH Retry-After → retryable, parsed delay", async () => {
    mockFetchError(429, { "Retry-After": "2" });
    const err = await extractError();
    expect(err).toBeInstanceOf(RetryableExtractionError);
    expect((err as RetryableExtractionError).retryAfterMs).toBe(2000);
  });

  it("429 WITHOUT Retry-After → retryable, no delay hint", async () => {
    mockFetchError(429);
    const err = await extractError();
    expect(err).toBeInstanceOf(RetryableExtractionError);
    expect((err as RetryableExtractionError).retryAfterMs).toBeUndefined();
  });

  it("500 → retryable", async () => {
    mockFetchError(500);
    const err = await extractError();
    expect(err).toBeInstanceOf(RetryableExtractionError);
  });

  it("network failure / timeout → retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted"); // AbortError-like / ECONNRESET
      }),
    );
    const err = await extractError();
    expect(err).toBeInstanceOf(RetryableExtractionError);
  });

  it("malformed JSON response → terminal (NOT retryable)", async () => {
    mockFetchOnceWithContent("this is not json");
    const err = await extractError();
    expect(err).toBeInstanceOf(MalformedExtractionError);
    expect(err).not.toBeInstanceOf(RetryableExtractionError);
  });

  it("401 invalid API key → terminal (NOT retryable)", async () => {
    mockFetchError(401);
    const err = await extractError();
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(RetryableExtractionError);
  });
});
