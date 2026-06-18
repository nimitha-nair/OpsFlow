import { getAiConfig } from "../../config/ai";
import type { ExpenseExtractor } from "./expense-extractor";
import { toKimiImageDataUri } from "./document-image";
import {
  MalformedExtractionError,
  parseModelJson,
  type ExtractionInput,
  type ExtractionResult,
} from "./extraction";
import { RetryableExtractionError, parseRetryAfterMs } from "./retry";

const SYSTEM_PROMPT =
  "You are an expense-receipt extraction engine. Read the receipt/invoice image " +
  "and return ONLY a strict JSON object — no prose, no markdown fences. Use this " +
  "exact shape, with null for any field you cannot read:\n" +
  `{"vendorName": string|null, "amount": number|null, "transactionDate": "YYYY-MM-DD"|null, ` +
  `"currency": string|null, "paymentMethod": string|null, "category": string|null, ` +
  `"taxInformation": string|null, "lowConfidenceReason": string|null, "confidenceScore": number}\n` +
  "amount is the numeric total with no currency symbol. confidenceScore is an " +
  "integer 0-100 reflecting overall extraction certainty. When confidenceScore is " +
  "below 70, set lowConfidenceReason to a brief explanation of what made the receipt " +
  "hard to read (e.g. blur, glare, cropping); otherwise set it to null.";

/** Full call result, exposed for the verification harness (raw + parsed). */
export interface KimiCallResult {
  /** The complete HTTP JSON body returned by NVIDIA Build. */
  rawResponse: unknown;
  /** The model's message content (the JSON string it generated). */
  content: string;
  /** The validated, parsed extraction. */
  result: ExtractionResult;
}

/**
 * Call NVIDIA Build with a pre-built image data URI and return the raw response,
 * the raw model content, and the parsed extraction. Shared by the production
 * extractor and the CLI verification harness so the prompt/request never drift.
 */
export async function kimiExtractFromDataUri(
  dataUri: string,
): Promise<KimiCallResult> {
  const cfg = getAiConfig();
  if (!cfg.nvidiaApiKey) {
    throw new Error("NVIDIA_API_KEY is not configured");
  }

  {
    // Bound each call so a hung connection becomes a (retryable) timeout rather
    // than blocking the worker indefinitely.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.nvidiaTimeoutMs);

    let res: Response;
    try {
      res = await fetch(`${cfg.nvidiaBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${cfg.nvidiaApiKey}`,
        },
        body: JSON.stringify({
          model: cfg.nvidiaModel,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract the expense data from this receipt." },
                { type: "image_url", image_url: { url: dataUri } },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 1024,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      // Network failure / DNS / connection reset / timeout (AbortError) — retryable.
      const reason = err instanceof Error ? err.message : "network error";
      throw new RetryableExtractionError(`NVIDIA Build request failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      const status = res.status;
      // 429 — rate limited: retryable, honoring Retry-After when present.
      if (status === 429) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        throw new RetryableExtractionError(
          `NVIDIA Build rate limited (429): ${detail}`,
          retryAfterMs,
        );
      }
      // 5xx — server-side: retryable (503 may also carry Retry-After).
      if (status >= 500) {
        const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
        throw new RetryableExtractionError(
          `NVIDIA Build server error ${status}: ${detail}`,
          retryAfterMs,
        );
      }
      // 401/403 — invalid/expired API key: terminal, never retried.
      if (status === 401 || status === 403) {
        throw new Error(
          `NVIDIA Build auth error ${status} (check NVIDIA_API_KEY): ${detail}`,
        );
      }
      // Other 4xx (400 bad request, 413 too large, 415 unsupported, …): terminal.
      throw new Error(`NVIDIA Build error ${status}: ${detail}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      // A 200 with no usable content is a model-output problem, not transient.
      throw new MalformedExtractionError("NVIDIA Build returned no message content");
    }
    // parseModelJson throws MalformedExtractionError on bad JSON (terminal).
    const result = parseModelJson(content);
    return { rawResponse: data, content, result };
  }
}

/** Real extractor: NVIDIA Build / Kimi-K2.6 Vision. */
export const kimiExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    // toKimiImageDataUri throws on unsupported/unreadable documents — a terminal
    // error we do NOT wrap as retryable.
    const dataUri = await toKimiImageDataUri(input.documentId);
    const { result } = await kimiExtractFromDataUri(dataUri);
    return result;
  },
};
