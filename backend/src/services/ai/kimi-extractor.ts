import { getAiConfig } from "../../config/ai";
import type { ExpenseExtractor } from "./expense-extractor";
import { toKimiImageDataUrisForDocuments } from "./document-images";
import { buildKimiMessages } from "./kimi-request";
import {
  MalformedExtractionError,
  parseModelJson,
  type ExtractionInput,
  type ExtractionResult,
  type TokenUsage,
} from "./extraction";
import { RetryableExtractionError, parseRetryAfterMs } from "./retry";

/** Parse an OpenAI-style `usage` block into TokenUsage, or null if absent. */
function parseUsage(u: unknown): TokenUsage | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const total = o.total_tokens;
  if (typeof total !== "number") return null;
  return {
    promptTokens: typeof o.prompt_tokens === "number" ? o.prompt_tokens : 0,
    completionTokens:
      typeof o.completion_tokens === "number" ? o.completion_tokens : 0,
    totalTokens: total,
  };
}

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
 * Call NVIDIA Build with one-or-many pre-built image data URIs and return the raw
 * response, the raw model content, and the parsed extraction. Shared by the
 * production extractor and the CLI verification harness so the prompt/request
 * never drift.
 */
export async function kimiExtractFromDataUris(
  dataUris: string[],
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
          messages: buildKimiMessages(dataUris),
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
      usage?: unknown;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      // A 200 with no usable content is a model-output problem, not transient.
      throw new MalformedExtractionError("NVIDIA Build returned no message content");
    }
    // parseModelJson throws MalformedExtractionError on bad JSON (terminal).
    const result = parseModelJson(content);
    result.usage = parseUsage(data.usage);
    return { rawResponse: data, content, result };
  }
}

/**
 * Back-compat single-image wrapper around {@link kimiExtractFromDataUris}. Used by
 * the CLI verification harness (`try-kimi.ts`).
 */
export async function kimiExtractFromDataUri(
  dataUri: string,
): Promise<KimiCallResult> {
  return kimiExtractFromDataUris([dataUri]);
}

/** Real extractor: NVIDIA Build / Kimi-K2.6 Vision. */
export const kimiExtractor: ExpenseExtractor = {
  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const ids =
      input.documentIds && input.documentIds.length > 0
        ? input.documentIds
        : input.documentId
          ? [input.documentId]
          : [];
    // toKimiImageDataUrisForDocuments throws on unsupported/unreadable documents —
    // a terminal error we do NOT wrap as retryable.
    const dataUris = await toKimiImageDataUrisForDocuments(ids);
    const { result } = await kimiExtractFromDataUris(dataUris);
    return result;
  },
};
