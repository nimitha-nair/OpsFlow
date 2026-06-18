/**
 * Production retry policy for the NVIDIA Build / Kimi extractor.
 *
 * The rule is intentionally simple: retry ONLY `RetryableExtractionError`
 * (HTTP 429, HTTP 5xx, and network failures). Every other error — malformed
 * JSON, schema-validation failures, an invalid/expired API key, unsupported
 * documents — is terminal and propagates immediately without a retry.
 */

/** A transient failure that SHOULD be retried (429 / 5xx / network). */
export class RetryableExtractionError extends Error {
  /** Server-advised wait (from Retry-After), in ms, when present. */
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = "RetryableExtractionError";
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

export function isRetryable(err: unknown): err is RetryableExtractionError {
  return err instanceof RetryableExtractionError;
}

/**
 * Parse a `Retry-After` header into milliseconds. Supports both forms:
 * delta-seconds (e.g. "120") and an HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT").
 * Returns undefined when absent/unparseable.
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  nowMs: number = Date.now(),
): number | undefined {
  if (header == null) return undefined;
  const trimmed = header.trim();
  if (trimmed === "") return undefined;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const when = Date.parse(trimmed);
  if (!Number.isNaN(when)) {
    return Math.max(0, when - nowMs);
  }
  return undefined;
}

export interface BackoffOptions {
  /** 0-based index of the attempt that just failed. */
  attempt: number;
  /** Server-advised delay (Retry-After), if any. */
  retryAfterMs?: number;
  /** Base delay for the exponential schedule (ms). */
  baseMs?: number;
  /** Hard cap on any single wait (ms). */
  maxMs?: number;
  /** Injectable randomness for jitter (defaults to Math.random). */
  random?: () => number;
}

export const DEFAULT_BASE_MS = 500;
export const DEFAULT_MAX_MS = 30_000;

/**
 * Delay before the next retry:
 * - If the server sent Retry-After, honor it (capped at maxMs).
 * - Otherwise exponential backoff (base · 2^attempt, capped) with **full jitter**
 *   — a random value in [0, window] — which spreads retries and avoids a
 *   thundering herd against the API.
 */
export function computeBackoffMs(opts: BackoffOptions): number {
  const base = opts.baseMs ?? DEFAULT_BASE_MS;
  const max = opts.maxMs ?? DEFAULT_MAX_MS;
  const random = opts.random ?? Math.random;

  if (opts.retryAfterMs !== undefined) {
    return Math.min(Math.max(0, opts.retryAfterMs), max);
  }

  const window = Math.min(base * 2 ** opts.attempt, max);
  return Math.round(random() * window);
}

export interface RetryOptions {
  /** Additional attempts after the first (total attempts = maxRetries + 1). */
  maxRetries: number;
  baseMs?: number;
  maxMs?: number;
  /** Injectable sleep (defaults to setTimeout); tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Observability hook fired before each backoff wait. */
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    error: RetryableExtractionError;
  }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying ONLY `RetryableExtractionError` up to `maxRetries` times with
 * Retry-After-aware exponential backoff + jitter. Terminal errors are rethrown on
 * the first occurrence; if retries are exhausted the last retryable error is rethrown.
 */
export async function runWithRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= opts.maxRetries) {
        throw err;
      }
      const delayMs = computeBackoffMs({
        attempt,
        ...(err.retryAfterMs !== undefined
          ? { retryAfterMs: err.retryAfterMs }
          : {}),
        ...(opts.baseMs !== undefined ? { baseMs: opts.baseMs } : {}),
        ...(opts.maxMs !== undefined ? { maxMs: opts.maxMs } : {}),
        ...(opts.random !== undefined ? { random: opts.random } : {}),
      });
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
      attempt += 1;
    }
  }
}
