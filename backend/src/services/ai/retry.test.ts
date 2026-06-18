import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MAX_MS,
  RetryableExtractionError,
  computeBackoffMs,
  isRetryable,
  parseRetryAfterMs,
  runWithRetry,
} from "./retry";
import { MalformedExtractionError } from "./extraction";

describe("parseRetryAfterMs", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfterMs("120")).toBe(120_000);
    expect(parseRetryAfterMs("0")).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
  });

  it("returns undefined for missing/blank/garbage values", () => {
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs("  ")).toBeUndefined();
    expect(parseRetryAfterMs("soon")).toBeUndefined();
  });
});

describe("computeBackoffMs", () => {
  it("honors Retry-After (capped at maxMs)", () => {
    expect(computeBackoffMs({ attempt: 9, retryAfterMs: 2000, baseMs: 500 })).toBe(2000);
    expect(computeBackoffMs({ attempt: 0, retryAfterMs: 999_999 })).toBe(DEFAULT_MAX_MS);
  });

  it("grows exponentially with full jitter", () => {
    const full = (attempt: number) =>
      computeBackoffMs({ attempt, baseMs: 500, random: () => 1 });
    expect(full(0)).toBe(500);
    expect(full(1)).toBe(1000);
    expect(full(2)).toBe(2000);
  });

  it("applies jitter between 0 and the window", () => {
    expect(computeBackoffMs({ attempt: 2, baseMs: 500, random: () => 0 })).toBe(0);
    expect(computeBackoffMs({ attempt: 2, baseMs: 500, random: () => 0.5 })).toBe(1000);
  });

  it("caps the exponential window at maxMs", () => {
    expect(
      computeBackoffMs({ attempt: 20, baseMs: 500, maxMs: 30_000, random: () => 1 }),
    ).toBe(30_000);
  });
});

describe("isRetryable", () => {
  it("is true only for RetryableExtractionError", () => {
    expect(isRetryable(new RetryableExtractionError("x"))).toBe(true);
    expect(isRetryable(new Error("x"))).toBe(false);
    expect(isRetryable(new MalformedExtractionError("x"))).toBe(false);
  });
});

describe("runWithRetry", () => {
  const noSleep = vi.fn(async () => {});

  it("retries a transient failure then succeeds (≤ maxRetries)", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new RetryableExtractionError("429");
      return "ok";
    });
    const sleep = vi.fn(async () => {});
    const result = await runWithRetry(fn, { maxRetries: 2, sleep, random: () => 0.5 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("respects Retry-After on each backoff", async () => {
    const fn = vi.fn(async () => {
      throw new RetryableExtractionError("rate limited", 1234);
    });
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    await expect(
      runWithRetry(fn, { maxRetries: 2, sleep }),
    ).rejects.toBeInstanceOf(RetryableExtractionError);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1234, 1234]); // server guidance honored
  });

  it("throws the last error when retries are exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new RetryableExtractionError("500");
    });
    await expect(
      runWithRetry(fn, { maxRetries: 2, sleep: noSleep, random: () => 0 }),
    ).rejects.toThrow("500");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry terminal errors (malformed / generic)", async () => {
    const sleep = vi.fn(async () => {});
    const malformed = vi.fn(async () => {
      throw new MalformedExtractionError("bad json");
    });
    await expect(
      runWithRetry(malformed, { maxRetries: 2, sleep }),
    ).rejects.toBeInstanceOf(MalformedExtractionError);
    expect(malformed).toHaveBeenCalledTimes(1);

    const auth = vi.fn(async () => {
      throw new Error("invalid api key");
    });
    await expect(runWithRetry(auth, { maxRetries: 2, sleep })).rejects.toThrow(
      "invalid api key",
    );
    expect(auth).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
